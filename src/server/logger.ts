import { Client } from "./client";

const winston = require("winston");
const loggerSettings = {
  transports: [new winston.transports.Console()],
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(
      (info) => `${info.timestamp} [${info.level}] ${info.message}`
    )
  ),
};

const logger = winston.createLogger(loggerSettings);

const logClient = function (client: Client, str: string) {
  logger.info("id " + client.id + ": " + str);
};

export { logger, logClient };
