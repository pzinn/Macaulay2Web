import ssh2 = require("ssh2");
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
  const sshConnection: ssh2.Client = new ssh2.Client();

  const userPath = userSpecificPath(client);
  const targetPath = staticFolder + userPath;
  const targetFileName = targetPath + fileName;
  let sourceFileName1 = sourceFileName; // adjusted for possible base dir

  const success = function () {
    logClient(client, "Successfully downloaded " + sourceFileName1);
    setTimeout(unlink(targetFileName), 1000 * 60 * 10);
    sshConnection.end();
    next(userPath + fileName);
  };

  const failure = function () {
    logClient(client, "failed to download " + sourceFileName);
    sshConnection.end();
    next();
  };

  fs.mkdir(targetPath, function (fsError) {
    if (fsError) {
      if (fsError.code !== "EEXIST")
        logger.error("Error creating directory: " + targetPath);
    }
    sshConnection.on("ready", function () {
      sshConnection.sftp(function (generateError, sftp) {
        if (generateError) {
          logger.error("ssh2.sftp() failed: " + generateError);
          return failure();
        }
        const relative = !sourceFileName.startsWith("/");
        sourceFileName1 =
          options.serverConfig.baseDirectory +
          (relative ? sourceFileName : sourceFileName.substring(1));
        sftp.fastGet(sourceFileName1, targetFileName, function (sftpError) {
          if (!sftpError) success();
          else if (relative) failure();
          else {
            // annoying subtlety: if relative false, we don't know if path relative or absolute => try both :/
            sourceFileName1 = sourceFileName;
            sftp.fastGet(sourceFileName1, targetFileName, function (sftpError) {
              if (!sftpError) success();
              else failure();
            });
          }
        });
      });
    });
    sshConnection.connect(sshCredentials(client.instance));
  });
};

export { downloadFromDocker };
