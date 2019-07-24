import { Definitions } from "boothby-definitions";
import {Request, Response} from "express";
import { Observable } from "rxjs";

export interface IQueueProvider {
  /**
   * Any setup that's required to use the provider before processing requests
   * should be done here.
   */
  setup(): Observable<boolean>;
  tearDown(): Observable<boolean>;
  processRequest(req: Request, res: Response): Observable<Definitions.ILambdaResponse>;
}
