import Denque = require("denque");
import { ILogger, ILogMessage } from "../interfaces";

export class ArrayLogger implements ILogger {

  public q = new Denque<ILogMessage>();

  public write(message: ILogMessage) {
    this.q.push(message);
  }
}
