import {raw} from "body-parser";
import { Definitions } from "boothby-definitions";
import * as express from "express";
import v4 = require("uuid/v4");
import {IQueueProvider} from "./backends";

class App {
  public express: express.Application;

  private queueProvider: IQueueProvider;

  constructor(queueProvider: IQueueProvider) {
    this.express = express();
    this.queueProvider = queueProvider;
    this.middleware();
    this.routes();
  }

  private middleware(): void {
    this.express.use((req, res, next) => {
      res.append("X-Request-Id", v4());
      next();
    });

    this.express.use(raw({
      type: "*/*",
    }));
  }

  private routes(): void {
    const router = express.Router();

    router.all("*", (req, res, next) => {
      this.queueProvider
        .processRequest(req, res)
        .take(1)
        .subscribe((response: Definitions.ILambdaResponse) => {
          res.send(response.body);
        });
    });

    this.express.use("*", router);
  }
}

export default App;
