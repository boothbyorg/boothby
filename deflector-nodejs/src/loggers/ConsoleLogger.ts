import Denque = require("denque");
import { ILogger, ILogMessage } from "../interfaces";

export class ConsoleLogger implements ILogger {
  public write(message: ILogMessage) {
    console.log(message);
  }
}
