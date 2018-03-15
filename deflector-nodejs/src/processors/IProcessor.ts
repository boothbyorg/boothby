import { Definitions } from "boothby-definitions";
import { Observable, Subject } from "rxjs";
import { ILambdaResponse } from "src/interfaces";

export interface IProcessor {
  setup(): Observable<boolean>;
  getMessages(): Subject<Definitions.ILambdaRequest>;
  sendResponse(request: Definitions.ILambdaRequest, response: ILambdaResponse): void;
  ack(requestId: string): void;
  nack(requestId: string): void;
  destroy(): void;
}
