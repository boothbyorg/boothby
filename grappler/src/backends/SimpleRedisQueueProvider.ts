import { Definitions } from "boothby-definitions";
import {Request, Response} from "express";
import {RedisClient} from "redis";
import {Observable, Subscriber} from "rxjs";
import {IQueueProvider} from "./";

export class SimpleRedisQueueProvider implements IQueueProvider {
  private client: RedisClient;
  private pub: RedisClient;
  private sub: RedisClient;

  constructor() {
    this.client = new RedisClient({
      host: process.env.REDIS_HOST,
    });
  }

  public setup(): Observable<boolean> {
    return Observable.of(true);
  }

  public tearDown(): Observable<boolean> {
    this.client.quit();

    return Observable.of(true);
  }

  public processRequest(req: Request, res: Response): Observable<Definitions.ILambdaResponse> {
    throw Error("Not Implemented");
    // const id: string = res.get("X-Request-Id");
    //
    // return new Promise<string>((resolve, reject) => {
    //
    //   // Per the docs:
    //   // When a client issues a SUBSCRIBE or PSUBSCRIBE, that connection is put into a "subscriber" mode.
    //   // At that point, only commands that modify the subscription set are valid and quit.
    //   // When the subscription set is empty, the connection is put back into regular mode.
    //   // const sub = this.client.duplicate();
    //   this.publishAndListen(process.env.CONSUMER_NAME, JSON.stringify({
    //     requestBody: req.body,
    //     requestId: id,
    //   }), id).subscribe(resolve);
    // });
  }

  private duplicateConnection(): Promise<RedisClient> {
    return new Promise<RedisClient>((resolve, reject) => {
      this.client.duplicate({}, (err: Error | null, client: RedisClient) => {
        if (err) {
          reject(err);
        }
        resolve(client);
      });
    });
  }

  /**
   * Helper function for subscribing to a redis event, returning a message.
   * @param  sub       The RedisClient to use.
   * @param  eventName The event to join.
   * @return           An Observable that will return the message from the event.
   */
  private fromEvent(sub: RedisClient, eventName: string): Observable<string> {
    return Observable
      .fromEvent(sub, eventName, (_: string, message: string) => message);
  }

  private publishAndListen(publishChannel: string, publishMessage: string, listenChannel: string): Observable<string> {
    return Observable.fromPromise(this.duplicateConnection())
      .flatMap((sub: RedisClient) => {
        // Subscribe to redis's "subscribe" event.
        this
          .fromEvent(sub, "subscribe")
          .take(1)
          .subscribe(() => {
            this.client.publish(publishChannel, publishMessage);
          });

        sub.subscribe(listenChannel);

        return this
          .fromEvent(sub, "message")
          .take(1)
          .finally(() => {
            sub.quit();
          });
      })
      .timeoutWith(900, Observable.of("Unable to process request."));
  }
}
