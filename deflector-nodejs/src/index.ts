import dotenv = require("dotenv");
import { ProcessManager } from "./services/ProcessManager";

// Import env
dotenv.config();

const manager = new ProcessManager();

process.on("SIGINT", () => {
  manager.destroy();

  console.log("Shutting down complete.");
});
