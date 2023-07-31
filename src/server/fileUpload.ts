import { Client } from "./client";
import ssh2 = require("ssh2");
import { logger } from "./logger";
import { unlink, options, sshCredentials } from "./server";

const uploadToInstance = function (
  client: Client,
  filePath: string,
  fileName: string,
  next
) {
  if (!fileName || !client.instance || !client.instance.host) return;
  if (!fileName.startsWith("/"))
    fileName = options.serverConfig.baseDirectory + fileName;
  const credentials = sshCredentials(client.instance);
  const sshConnection: ssh2.Client = new ssh2.Client();
  sshConnection.on("ready", function () {
    sshConnection.sftp(function (err, sftp) {
      if (err) {
        logger.error(
          "There was an error while connecting via sftp: " + err,
          client
        );
        sshConnection.end();
        return next("", err);
      }
      logger.info("Uploading " + fileName, client);
      sftp.fastPut(filePath, fileName, function (sftpError) {
        unlink(filePath);
        if (sftpError) {
          logger.error(
            "Error while uploading file: " + fileName + ", ERROR: " + sftpError,
            client
          );
          sshConnection.end();
          next("", sftpError);
        } else if (fileName.endsWith(".tar.gz")) {
          // TODO: .tar and .gz separately?
          const cmd =
            "tar zxf " +
            fileName +
            " -C `dirname " +
            fileName +
            "`; rm " +
            fileName;
          sshConnection.exec(cmd, function (err, stream) {
            if (err) {
              logger.error("failed to execute " + cmd, client);
              sshConnection.end();
              return next("", err);
            }
            stream
              .on("close", () => {
                logger.info("successfully executed " + cmd, client);
                sshConnection.end();
                next(fileName + " (extracted)<br/>");
              })
              .on("data", (data) => {})
              .stderr.on("data", (data) => {});
          });
        } else {
          sshConnection.end();
          next(fileName + "<br/>");
        }
      });
    });
  });
  sshConnection.on("error", function (error) {
    logger.error("ssh2 connection failed: " + error, client);
    sshConnection.end(); // we don't want more errors produced
    next("", error);
  });
  sshConnection.connect(credentials);
};

export { uploadToInstance };
