import { Channel, connect, Connection, Message } from "amqplib";
import { Type } from "avsc";
import { Definitions } from "boothby-definitions";
import { Request, Response } from "express";
import { isObject } from "lodash";
import { Observable, Subject, Subscriber } from "rxjs";
import { v4 } from "uuid";
import { IQueueProvider } from ".";

export class AMQPQueueProvider implements IQueueProvider {
  private connection: Connection;

  // Q and sub channels
  private queue: Channel;
  private sub: Channel;

  private processQueue = process.env.CONSUMER_NAME + "requests";
  private exchangeName = process.env.CONSUMER_NAME;
  private queueIdentifier: string = null;
  private messages = new Subject<Definitions.ILambdaResponse>();

  private grapplerRequest = Type.forSchema(Definitions.GrapplerRequest);
  private grapplerResponse = Type.forSchema(Definitions.GrapplerResponse);

  public setup(): Observable<boolean> {
    return Observable.fromPromise(connect(process.env.AMQP_URL))
      .flatMap((connection) => {
        this.connection = connection;
        return Promise.all([connection.createChannel(), connection.createChannel()]);
      })
      .flatMap((channels) => {
        this.queue = channels[0];
        this.sub = channels[1];

        // The queue is niether marked as durable nor is it marked for peristance.
        // In later versions these features might make sense as a tradeoff
        // for latency, assuming the behaviour is something the client is
        // wanting (eg retry behavior? dead letter queue?)
        return this.queue.assertQueue(this.processQueue, { durable: false });
      })
      .flatMap(() => this.sub.assertExchange(this.exchangeName, "direct", { durable: false }))
      .flatMap(() => this.sub.assertQueue("", { exclusive: true }))
      .flatMap((q) => {
        // Responses should be published to this queue.
        this.queueIdentifier = q.queue;

        return this.sub.bindQueue(q.queue, this.exchangeName, this.queueIdentifier);
      })
      .flatMap(() => {
        this.sub.consume(this.queueIdentifier, (msg) => this.processResponse(msg));

        return Observable.of(true);
      });
  }

  public tearDown(): Observable<boolean> {
    this.messages.complete();

    const asyncActions = [
      this.sub.close(),
      this.queue.close(),
      this.connection.close(),
    ];

    return Observable.fromPromise(Promise.all(asyncActions))
      .flatMap(() => Observable.of(true));
  }

  public processRequest(req: Request, res: Response): Observable<Definitions.ILambdaResponse> {
    const requestId = res.get("X-Request-Id");
    const x = this.buildGrapplerRequest(req, res);

    return Observable.defer(() => {
        this.queue.sendToQueue(this.processQueue, x, {persistent: false});
        return this.messages;
      })
      .filter((resp) => resp.requestId === requestId)
      .take(1)
      .timeoutWith(900, Observable.of({
        body: "Unable to process request.",
        isBase64: false,
        requestId,
        statusCode: 503,
      }));
  }

  private processResponse(msg: Message): void {
    const resp: any = this.grapplerResponse.fromBuffer(msg.content);
    this.messages.next(resp as Definitions.ILambdaResponse);
    console.log("acking!");
    this.sub.ack(msg);
  }

  private buildGrapplerRequest(req: Request, res: Response): Buffer {
    const obj = {
      callbackQueueName: this.queueIdentifier,
      enqueuedAt: Date.now(),
      expiresAt: Date.now() + 60, // Expire in 1 minute.
      httpBody: req.body instanceof Buffer ? req.body.toString("base64") : "",
      httpMethod: req.method,
      httpParams: req.headers,
      httpQueryParams: isObject(req.query) ? JSON.stringify(req.query) : "",
      requestId: res.get("X-Request-Id"),
    };
    return this.grapplerRequest.toBuffer(obj);
  }
}
