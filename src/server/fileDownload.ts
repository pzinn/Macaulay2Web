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
  let fileName: string = path.basename(sourceFileName);
  if (!fileName || !client.instance || !client.instance.host) return next();
  const sshConnection: ssh2.Client = new ssh2.Client();

  const userPath = userSpecificPath(client);
  const targetPath = staticFolder + userPath;

  fs.mkdir(targetPath, function (fsError) {
    if (fsError) {
      if (fsError.code !== "EEXIST")
        logger.error("Error creating directory: " + targetPath);
    }
    sshConnection.on("ready", function () {
      sshConnection.sftp(function (generateError, sftp) {
        let sourceFileName1; // adjusted for possible base dir
        let targetFileName;

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

        if (generateError) {
          logger.error("ssh2.sftp() failed: " + generateError);
          return failure();
        }

        const checkExists = function (doesNot) {
          sftp.stat(sourceFileName1, function (err, res) {
            if (err || !res) doesNot();
            else if (res.isFile()) copyFile();
            else if (res.isDirectory()) readDir();
            else doesNot(); // we don't follow symbolic links
          });
        };

        const copyFile = function () {
          targetFileName = targetPath + fileName;
          sftp.fastGet(sourceFileName1, targetFileName, function (sftpError) {
            if (!sftpError) success();
            else failure();
          });
        };

        const readDir = function () {
          sftp.readdir(sourceFileName1, function (sftpError, lst) {
            if (sftpError) return failure();
            const s = lst
              .map((x) => x.filename + (x.longname[0] == "d" ? "/" : ""))
              .join("\n");
            fileName = "directory@" + fileName; // eww
            targetFileName = targetPath + fileName;
            fs.writeFile(targetFileName, s, function (sftpError) {
              if (!sftpError) success();
              else failure();
            });
          });
        };

        // determine where and if file exists
        const relative = !sourceFileName.startsWith("/");
        sourceFileName1 =
          options.serverConfig.baseDirectory +
          (relative ? sourceFileName : sourceFileName.substring(1));
        checkExists(function () {
          if (relative) failure();
          else {
            // annoying subtlety: if relative false, we don't know if path relative or absolute => try both :/
            sourceFileName1 = sourceFileName;
            checkExists(failure);
          }
        });
      });
    });
    sshConnection.connect(sshCredentials(client.instance));
  });
};

export { downloadFromDocker };
