import shortid =  require("shortid");
import { ILogger } from "../interfaces";

/**
 * Helper class with default options.
 */
export class ProcessOptions {
  public lambdaHandler = "handler";
  public lambdaPath = "/tmp/lambda/";
  public processLocation = "/deflector/src/becon.js";
  public requestTimeout = 100;
  public socketPath = "/tmp/." + shortid();
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  public getLogger() {
    return this.logger;
  }
}
