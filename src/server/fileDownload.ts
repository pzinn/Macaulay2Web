const ssh2 = require("ssh2");
import fs = require("fs");
import { Client } from "./client";
import path = require("path");
import { logger, logClient } from "./logger";
import { staticFolder, unlink, options } from "./server";

const userSpecificPath = function (client: Client): string {
  return client.id + "-files/";
};

const downloadFromDocker = function (
  client: Client,
  sourceFileName: string,
  sshCredentials,
  next
) {
  const fileName: string = path.basename(sourceFileName);
  if (!fileName || !client.instance || !client.instance.host) return;
  if (!sourceFileName.startsWith("/"))
    sourceFileName = options.serverConfig.baseDirectory + sourceFileName;
  const sshConnection = ssh2();
  sshConnection.on("end", function () {
    logger.info("File action ended.");
  });

  const userPath = userSpecificPath(client);
  const targetPath = staticFolder + userPath;

  const handleUserGeneratedFile = function (generateError, sftp) {
    if (generateError) {
      throw new Error("ssh2.sftp() failed: " + generateError);
    }
    fs.mkdir(targetPath, function (fsError) {
      if (fsError) {
        if (fsError.code !== "EEXIST")
          logger.error("Error creating directory: " + targetPath);
        else logger.info("Folder exists");
      }
      logClient(client, "File we want is " + sourceFileName);
      const targetFileName = targetPath + fileName;
      sftp.fastGet(sourceFileName, targetFileName, function (sftpError) {
        if (sftpError) {
          logger.error(
            "Error while downloading file. PATH: " +
              sourceFileName +
              ", ERROR: " +
              sftpError
          );
          next();
        } else {
          setTimeout(unlink(targetFileName), 1000 * 60 * 10);
          next(userPath + fileName);
        }
      });
    });
  };
  sshConnection.on("ready", function () {
    sshConnection.sftp(handleUserGeneratedFile);
  });

  sshConnection.connect(sshCredentials(client.instance));
};

export { downloadFromDocker };
