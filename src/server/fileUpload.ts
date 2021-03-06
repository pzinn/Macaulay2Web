import { Client } from "./client";
import ssh2 = require("ssh2");
import { logger, logClient } from "./logger";
import { unlink, options } from "./server";

const uploadToDocker = function (
  client: Client,
  filePath: string,
  fileName: string,
  sshCredentials,
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
        logger.error("There was an error while connecting via sftp: " + err);
        sshConnection.end();
        return next(err);
      }
      logClient(client, "Uploading " + fileName);
      sftp.fastPut(filePath, fileName, function (sftpError) {
        unlink(filePath);
        if (sftpError)
          logger.error(
            "Error while uploading file: " + fileName + ", ERROR: " + sftpError
          );
        sshConnection.end();
        next(sftpError);
      });
    });
  });
  sshConnection.connect(credentials);
};

export { uploadToDocker };
