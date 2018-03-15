export interface ILogMessage {
  message: string;
  eventTimestamp: number;
  severity: "DEBUG" | "INFO" | "WARN" | "ERROR";
}
