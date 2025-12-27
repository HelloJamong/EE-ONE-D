import pino from "pino";
import { AppConfig } from "./env.js";

export function createLogger(config: AppConfig) {
  return pino({
    name: "ee-one-d",
    level: config.LOG_LEVEL,
  });
}
