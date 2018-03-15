export default class ILambdaResponse {
  private requestId: number;
  private httpStatus: number = 200;
  private httpBody: object = {};
  private httpHeaders: object[] = [{}];
}
