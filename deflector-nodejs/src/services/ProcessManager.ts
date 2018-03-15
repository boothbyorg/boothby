import Denque = require("denque");

import { Definitions } from "boothby-definitions";
import { ILogger } from "src/interfaces";
import { ConsoleLogger } from "../loggers/ConsoleLogger";
import { AMQPProcessor, IProcessor } from "../processors";
import { Process, ProcessState } from "./Process";
import { ProcessOptions } from "./ProcessOptions";
import { remove } from "lodash"

export class ProcessManager {

  public processes: Process[] = [];
  public logger: ILogger = new ConsoleLogger();
  public processor: IProcessor = new AMQPProcessor();

  public processorQueue = new Denque<Process>([]);

  private processorStarted = false;

  constructor() {
    for (let i = 0; i < parseInt(process.env.MAX_PROCESSES, 10); i++) {
      this.processes.push(this.createProcess(true));
    }
  }

  public destroy() {
    this.processes.forEach((p) => p.destroy());
    this.processor.destroy();
  }

  public setupProcessor() {
    this.processorStarted = true;
    this.processor
      .getMessages()
      .subscribe((msg) => this.onRequest(msg));

    this.processor.setup().take(1).subscribe();
  }

  private createProcess(start: boolean): Process {
    const p = new Process(new ProcessOptions(this.logger));

    p.getState().subscribe((state) => this.onProcessStateChange(p, state));

    if (start) {
      p.start();
    }

    return p;
  }

  private onRequest(msg: Definitions.ILambdaRequest) {
    const handler = this.processorQueue.pop();

    // If we don't have an open box, send it for requeue.
    if (!handler) {
      console.log("Skipping request: " + msg.requestId);
      this.processor.nack(msg.requestId);
      return;
    }

    this.processor.ack(msg.requestId);

    handler.handleRequest(msg)
      .take(1)
      .subscribe((response) => {
        this.processor.sendResponse(msg, response);
      });
  }

  private onProcessStateChange(p: Process, state: ProcessState) {
    if (state === ProcessState.PROCESS_READY) {
      this.processorQueue.push(p);

      // Start process requests once we have our first ready worker.
      if (!this.processorStarted) {
        this.setupProcessor();
      }
    } else if (state === ProcessState.PROCESS_DEAD) {
      // Once a process is dead we can remove it.
      this.processes = remove(this.processes, (n) => n.id === p.id);
    }
  }
}
