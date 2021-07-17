import { Client } from "./client";

const winston = require("winston");
const loggerSettings = {
  transports: [new winston.transports.Console()],
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(
      (info) =>
        `${info.timestamp}\t${info.level}\t${
          info.id ? info.id.padEnd(6) : ""
        }\t${info.message}`
    )
  ),
};

const logger = winston.createLogger(loggerSettings);

export { logger };
