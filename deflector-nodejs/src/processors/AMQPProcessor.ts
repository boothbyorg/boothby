import { Channel, connect, Connection, Message } from "amqplib";
import { Type } from "avsc";
import { Definitions } from "boothby-definitions";
import { Observable, Subject } from "rxjs";
import { ILambdaResponse } from "src/interfaces";
import { IProcessor } from "./IProcessor";

export class AMQPProcessor implements IProcessor {
  private connection: Connection;

  // Q and pub channels
  private queue: Channel;
  private pub: Channel;

  private processQueue = process.env.CONSUMER_NAME + "requests";
  private messages = new Subject<Definitions.ILambdaRequest>();

  private grapplerRequest = Type.forSchema(Definitions.GrapplerRequest);
  private grapplerResponse = Type.forSchema(Definitions.GrapplerResponse);

  private messagesToAck = new Map<string, Message>();

  public setup(): Observable<boolean> {
    return Observable.fromPromise(connect(process.env.AMQP_URL))
      .flatMap((connection) => {
        this.connection = connection;
        return Promise.all([connection.createChannel(), connection.createChannel()]);
      })
      .flatMap((channels) => {
        this.queue = channels[0];
        this.pub = channels[1];

        this.queue.assertQueue(this.processQueue, { durable: false });

        this.queue.prefetch(1);

        this.queue.consume(this.processQueue, (msg) => {
          const avroMessage: any = this.grapplerRequest.fromBuffer(msg.content);
          const lambdaRequest = avroMessage as Definitions.ILambdaRequest;

          // Let the manager come back to ack this request
          this.messagesToAck.set(lambdaRequest.requestId, msg);

          this.messages.next(lambdaRequest);
        }, {noAck: false});

        return Observable.of(true);
      });
  }

  public ack(requestId: string) {
    this.queue.ack(this.messagesToAck.get(requestId));
    this.messagesToAck.delete(requestId);
  }

  public nack(requestId: string) {
    this.queue.nack(this.messagesToAck.get(requestId));
    this.messagesToAck.delete(requestId);
  }

  public sendResponse(request: Definitions.ILambdaRequest, response: ILambdaResponse) {
    const buffer = this.grapplerResponse.toBuffer(response.callbackData);

    return this.pub.sendToQueue(request.callbackQueueName, buffer);
  }

  public destroy() {
    this.messages.complete();

    const asyncActions = [
      this.pub.close(),
      this.queue.close(),
      this.connection.close(),
    ];

    Promise.all(asyncActions);
  }

  public getMessages(): Subject<Definitions.ILambdaRequest> {
    return this.messages;
  }
}
