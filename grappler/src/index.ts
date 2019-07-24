import dotenv = require("dotenv");

// Import env
dotenv.config();

import { Type } from "avsc";
import * as http from "http";
import App from "./App";
import {AMQPQueueProvider, SimpleRedisQueueProvider} from "./backends";

const provider = new AMQPQueueProvider();

const application = new App(provider);

provider.setup().take(1).subscribe((result) => {
  if (!result) { throw Error("Unable to start provider"); }

  const server = http.createServer(application.express);
  server.listen(3000);

  server.on("error", (msg: string) => console.error(msg));
  server.on("listening", (msg: string) => console.log(server.address()));

  process.on("SIGINT", () => {
    server.close();
    provider.tearDown().take(1).subscribe(() => { console.log("Destroyed"); });
    application.close();

    console.log("Shutting Down Server");
  });
});
