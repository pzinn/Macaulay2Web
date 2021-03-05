import fs = require("fs");
import { Client } from "./client";
import ssh2 = require("ssh2");
import { logger, logClient } from "./logger";
import { unlink } from "./server";

const uploadToDocker = function (
  client: Client,
  filePath: string,
  fileName: string,
  sshCredentials,
  next
) {
  const credentials = sshCredentials(client.instance);
  const connection: ssh2.Client = new ssh2.Client();
  connection.on("ready", function () {
    connection.sftp(function (err, sftp) {
      if (err) {
        logger.error("There was an error while connecting via sftp: " + err);
        return; // ?
      }
      logger.info("Uploading " + fileName);
      sftp.fastPut(filePath, fileName, function (sftpError) {
        unlink(filePath);
        if (sftpError)
          logger.error(
            "Error while uploading file: " + fileName + ", ERROR: " + sftpError
          );
        next(sftpError);
      });
    });
  });
  connection.connect(credentials);
};

export { uploadToDocker };
