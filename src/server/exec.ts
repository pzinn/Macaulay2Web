import ssh2 = require("ssh2");
import { Client } from "./client";
import { logger, logClient } from "./logger";
import { sshCredentials } from "./server";

const execInInstance = function (client: Client, cmd: string, next) {
  const sshConnection: ssh2.Client = new ssh2.Client();
  sshConnection.on("ready", function () {
    logClient(client, "executing " + cmd);
    sshConnection.exec(cmd, function (err, stream) {
      if (err) {
        logger.error("failed to execute " + cmd);
        return next();
      }
      let out = "";
      stream
        .on("close", () => {
          logger.info("successfully executed " + cmd);
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
