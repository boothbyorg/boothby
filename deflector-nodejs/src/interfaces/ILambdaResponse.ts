import { ILogMessage } from ".";

export interface IHttpHeaders {
  [key: string]: string;
}

export interface ILambdaResponse {
  logs?: ILogMessage[];
  callbackData: {
    requestId: string,
    statusCode: number,
    headers?: IHttpHeaders,
    body?: string,
    isBase64?: boolean,
  };
}
