import Denque = require("denque");
import { Client, HighLevelProducer } from "kafka-node";
import { ILogger, ILogMessage } from "../interfaces";

export class KafkaLogger implements ILogger {

  private client: Client;
  private producer: HighLevelProducer;
  private q = new Denque<ILogMessage>();

  constructor() {
    this.client = new Client("zookeeper:2181/");
    this.producer = new HighLevelProducer(this.client);
    this.producer.on("ready", () => {
      this.drain();
    });
  }

  public write(message: ILogMessage) {
    this.producer.send([{topic: "deflector-logs", messages: ["kek1"]}], (err, data) => {
      // If there is an error, enqueue the message to be sent back.
      if (err) {
        this.q.push(message);
      }
    });
  }

  private drain() {
    const message = this.q.pop();

    if (message) {
      this.write(message);
    }
  }
}
