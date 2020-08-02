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

module.exports = winston.createLogger(loggerSettings);
