import { Definitions } from "boothby-definitions";
import {Request, Response} from "express";
import { Observable } from "rxjs";

export interface IQueueProvider {
  setup(): Observable<boolean>;
  tearDown(): Observable<boolean>;
  processRequest(req: Request, res: Response): Observable<Definitions.ILambdaResponse>;
}
