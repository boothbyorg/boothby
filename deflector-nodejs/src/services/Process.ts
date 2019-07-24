import { ChildProcess, spawn } from "child_process";
import { unlink } from "fs";
import { connect, Socket } from "net";
import { BehaviorSubject, Observable, Observer, Subject } from "rxjs";
import { v4 } from "uuid";

import { ILambdaResponse } from "src/interfaces/ILambdaResponse";

import { readProtocol, Service } from "avsc";
import { Definitions } from "boothby-definitions";
import { ProcessOptions } from "./ProcessOptions";

export enum ProcessState {
  PROCESS_CREATING, // The process is in its inital warmup state.
  PROCESS_DEAD, // The process is dead and can no longer be used.
  PROCESS_DYING, // The process is about to die.
  PROCESS_READY, // The process is locked and loaded.
  PROCESS_REQUEST_SENT, // A request was sent the the process to be handled.
  PROCESS_SPAWINING, // We have spawned the process.
  PROCESS_TIMED_OUT, // The process has timed out and will be killed shortly.
}

interface IBeaconClient extends Service.Client {
    ProcessRequest(err: any, arg1: (err: Error, res: any) => void): void;
}

/**
 * This class houses exactly 1 process that can be in any of the states above.
 * A process will always work on 1 task at a time.
 */
export class Process {
  public readonly id = v4();

  private connection: Socket;
  private process: ChildProcess;
  private options: ProcessOptions;
  private processState = ProcessState.PROCESS_CREATING;
  private processState$ = new BehaviorSubject<ProcessState>(this.processState);
  private processData$ = new Subject<ILambdaResponse>();

  private client: Service.Client & IBeaconClient;

  /**
   * The id of the request that's currently being worked on.
   */
  private requestId: string;

  constructor(options: ProcessOptions) {
    this.options = options;
  }

  /**
   * Starts the process and establishes communication between this process and the child processes that execute the
   * request.
   */
  public start() {
    if (this.processState === ProcessState.PROCESS_CREATING) {
      const protocol = Definitions.Beacon;

      this.process = spawn("node", [this.options.processLocation], {
        env: {
          AVRO_PROTO: new Buffer(JSON.stringify(protocol)).toString("base64"),
          LAMBDA_HANDLER: this.options.lambdaHandler,
          LAMBDA_PATH: this.options.lambdaPath,
          SOCKET_PATH: this.options.socketPath,
        },
        gid: 1337,
        uid: 1337,
      });

      this.setState(ProcessState.PROCESS_SPAWINING);

      this.process.stdout.on("data", (m: Buffer) => {
        if (m.toString("utf8") === "READY") {
          this.connection = connect({path: this.options.socketPath});

          this.connection.on("connect", () => {
            this.setState(ProcessState.PROCESS_READY);
          });

          this.connection.on("error", () => {
            this.destroy();
          });

          const service = Service.forProtocol(protocol, {});
          this.client = service.createClient() as IBeaconClient;
          this.client.createChannel(this.connection);
        } else {
          console.log(m.toString("utf8"));
        }
      });

      this.process.on("exit", () => {
        this.destroy();
      });

      this.process.stderr.on("data", (m: Buffer) => console.log(m.toString("utf8")));

    } else {
      throw new Error("You cannot start a process that was already started.");
    }
  }

  /**
   * Return the observable state
   */
  public getState() {
    return this.processState$;
  }

  /**
   * Returns just the current state of the process.
   */
  public getCurrentState() {
    return this.processState;
  }

  /**
   * The function is the meat of handling the request. It pushes it to the created process and handles
   * errors, responses and any undefined behaviour.
   * @param request
   */
  public handleRequest(request: Definitions.ILambdaRequest): Observable<ILambdaResponse> {
    if (this.getCurrentState() === ProcessState.PROCESS_READY) {
      this.requestId = request.requestId;

      try {
        this.client.ProcessRequest(request, (err: Error, arg1: any) => {
          if (err) {
            this.processData$.error(err);

            // For now if an error happens, we terminate the process.
            // Todo: Do we? Continuing execution after an exception might cause un-intented side effects
            this.destroy();

            return;
          }

          this.processData$.next(arg1);
        });
      } catch (e) {
        console.error(e);
      }
      this.setState(ProcessState.PROCESS_REQUEST_SENT);

      return this
        .processData$
        .filter((m: ILambdaResponse) => m.callbackData.requestId === this.requestId)
        .do((m: ILambdaResponse) => this.setState(ProcessState.PROCESS_READY))
        .do((m: ILambdaResponse) => this.drainLogs(m))
        .take(1)
        .timeoutWith(
          this.options.requestTimeout * 1.5,
          Observable.defer(() => Observable.fromPromise(this.timeout())),
        )
        .catch((error) => {
          return Observable.of({
            callbackData: {
              body: "A error was thrown during processing.",
              requestId: request.requestId,
              statusCode: 500,
            },
          });
        });
    }

    return Observable.of({
      callbackData: {
        body: "A request was filled with a process that is currently unavailable.",
        requestId: request.requestId,
        statusCode: 500,
      },
    });
  }

  /**
   * Request this process to be destroyed.
   * These are the things we must do.
   * @return
   */
  public destroy(): Promise<ILambdaResponse> {
    // States that can't be destroy
    const undestroyableStates = [
      ProcessState.PROCESS_DEAD,
      ProcessState.PROCESS_DYING,
      ProcessState.PROCESS_CREATING,
    ];

    if (undestroyableStates.indexOf(this.getCurrentState()) !== -1) {
      return;
    }

    // Don't let another process try to destroy.
    this.setState(ProcessState.PROCESS_DYING);

    return new Promise((resolve, reject) => {
      if (!this.process.killed) {
        // Send a SIGTERM,
        this.process.kill("SIGTERM");

        // and give the process 100ms before a SIGKILL is sent.
        setTimeout(() => {
          this.cleanup();
          resolve();
        }, 100);
      } else {
        this.cleanup();
        resolve();
      }
    });
  }

  /**
   * Drains the logs from the process and sends them to the logger.
   * @param response
   */
  private drainLogs(response: ILambdaResponse) {
    response.logs.forEach((log) => {
      this.options.getLogger().write(log);
    });
  }

  /**
   * Updates the state of the process and publishes to a observable.
   * @param toState The state to change to.
   */
  private setState(toState: ProcessState) {
    this.processState = toState;
    this.processState$.next(toState);
  }

  /**
   * Once a timeout is triggered, we'll go ahead and start the destroy
   * process.
   * @return
   */
  private timeout(): Promise<ILambdaResponse> {
    this.setState(ProcessState.PROCESS_TIMED_OUT);
    return this.destroy();
  }

  /**
   * Handles termination of the process and any cleanup needed.
   */
  private cleanup() {
    // If the process is not killed, send a SIGKILL.
    if (!this.process.killed) {
      this.process.kill("SIGKILL");
    }

    // Mark this process as dead.
    this.setState(ProcessState.PROCESS_DEAD);

    // Don't leave lingering observables.
    this.processData$.complete();
    this.processState$.complete();

    // Close the connections
    this.connection.end();

    // Cleanup any lingering sockets.
    unlink(this.options.socketPath, (err) => {
      if (err instanceof Error && err.code !== "ENOENT") {
        throw err;
      }
    });
  }
}
