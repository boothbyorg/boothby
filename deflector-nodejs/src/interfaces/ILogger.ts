import { ILogMessage } from ".";

export interface ILogger {
  write(message: ILogMessage): void;
}
