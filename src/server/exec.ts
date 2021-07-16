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
  sshConnection.connect(sshCredentials(client.instance));
};

export { execInInstance };
