import dotenv = require("dotenv");
import { v4 } from "uuid";
import { ArrayLogger } from "./loggers/ArrayLogger";
import { KafkaLogger } from "./loggers/KafkaLogger";
import { AMQPProcessor } from "./processors/AMQPProcessor";
import { Process, ProcessState } from "./services/Process";
import { ProcessManager } from "./services/ProcessManager";

// Import env
dotenv.config();

const manager = new ProcessManager();

process.on("SIGINT", () => {
  manager.destroy();

  console.log("Shutting down complete.");
});
