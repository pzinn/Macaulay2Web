const ssh2 = require("ssh2");
import fs = require("fs");
import { Client } from "./client";
import path = require("path");
const logger = require("./logger");

const unlink = function (completePath: string) {
  return function () {
    fs.unlink(completePath, function (err) {
      if (err) {
        logger.warn(
          "Unable to unlink user generated file " + completePath + " : " + err
        );
      }
    });
  };
};

const downloadFromDocker = function (
  client: Client,
  sourcePath: string,
  targetPath: string,
  sshCredentials,
  logFunction,
  next
) {
  const fileName: string = path.basename(sourcePath);
  if (!fileName) {
    return;
  }
  const sshConnection = ssh2();
  sshConnection.on("end", function () {
    logFunction("File action ended.");
  });

  const handleUserGeneratedFile = function (generateError, sftp) {
    if (generateError) {
      throw new Error("ssh2.sftp() failed: " + generateError);
    }
    fs.mkdir(targetPath, function (fsError) {
      if (fsError) {
        if (fsError.code !== "EEXIST")
          logger.error("Error creating directory: " + targetPath);
        else logFunction("Folder exists");
      }
      logger.info("File we want is " + sourcePath);
      const completePath = targetPath + fileName;
      sftp.fastGet(sourcePath, completePath, function (sftpError) {
        if (sftpError) {
          logger.error(
            "Error while downloading file. PATH: " +
              sourcePath +
              ", ERROR: " +
              sftpError
          );
          next();
        } else {
          setTimeout(unlink(completePath), 1000 * 60 * 10);
          next(completePath);
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
