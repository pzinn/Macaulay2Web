import ssh2 = require("ssh2");
import { Client } from "./client";
import { logger } from "./logger";
import { sshCredentials } from "./server";

const execInInstance = function (client: Client, cmd: string, next) {
  const sshConnection: ssh2.Client = new ssh2.Client();
  sshConnection.on("ready", function () {
    logger.info("executing " + cmd, client);
    sshConnection.exec(cmd, function (err, stream) {
      if (err) {
        logger.error("failed to execute " + cmd, client);
        sshConnection.end();
        return next();
      }
      let out = "";
      stream
        .on("close", () => {
          logger.info("successfully executed " + cmd, client);
          sshConnection.end();
          next(out);
        })
        .on("data", (data) => {
          out += data.toString();
        })
        .stderr.on("data", (data) => {
          out += data.toString(); // ?
        });
    });
  });
  sshConnection.on("error", function (error) {
    logger.error("ssh2 connection failed: " + error, client);
    sshConnection.end(); // we don't want more errors produced
    next();
  });
  sshConnection.connect(sshCredentials(client.instance));
};

export { execInInstance };
