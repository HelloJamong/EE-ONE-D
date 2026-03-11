import { pino, Logger } from "pino";
import { AppConfig } from "./env.js";

export function createLogger(config: AppConfig): Logger {
  return pino({
    name: "ee-one-d",
    level: config.LOG_LEVEL,
  });
}
