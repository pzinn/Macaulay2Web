import ssh2 = require("ssh2");
import fs = require("fs");
import { Client, userSpecificPath } from "./client";
import path = require("path");
import { logger } from "./logger";
import { staticFolder, unlink, options, sshCredentials } from "./server";

// note that downloadFromInstance is currently called in two distinct ways: (see in server.ts)
// * by fileexists request from the client e.g. trying to open a docker file in editor
// * by direct fileDownload (url from a connected client is automatically forwarded to the docker)
// the first way might seem redundant but the second way is actually not great
// (what if there's a public file with the same name?)

const downloadFromInstance = function (
  client: Client,
  sourceFileName: string,
  next
) {
  let fileName: string = path.basename(sourceFileName);
  if (!fileName || !client.instance || !client.instance.host) return next();
  const sshConnection: ssh2.Client = new ssh2.Client();

  const userPath = userSpecificPath(client.id);
  const targetPath = staticFolder + userPath;
  let targetFileName;

  // not strictly necessary but convenient: don't bother copying files from the tutorials/ subdirectory because they come from the server anyway
  // added advantage: they're marked readonly automatically
  if (path.dirname(sourceFileName) == "tutorials") {
    const tuteFileName = "files/readonly@" + sourceFileName;
    targetFileName = staticFolder + tuteFileName;
    fs.access(targetFileName, fs.constants.F_OK, (error) => {
      if (error) {
        logger.warn("failed to download " + sourceFileName, client);
        next();
      } else {
        logger.info("successfully accessed " + sourceFileName, client);
        next(tuteFileName);
      }
    });
    return;
  }

  sshConnection.on("ready", function () {
    sshConnection.sftp(function (generateError, sftp) {
      let sourceFileName1; // adjusted for possible base dir

      const success = function () {
        logger.info("successfully downloaded " + sourceFileName1, client);
        setTimeout(unlink(targetFileName), 1000 * 60 * 10);
        sshConnection.end();
        next(userPath + fileName);
      };
      const failure = function () {
        logger.warn("failed to download " + sourceFileName, client);
        sshConnection.end();
        next();
      };

      if (generateError) {
        logger.error("ssh2.sftp() failed: " + generateError, client);
        return failure();
      }

      const checkExists = function (doesNot) {
        sftp.stat(sourceFileName1, function (err, res) {
          if (err || !res) doesNot();
          else if (res.isFile()) copyFile(!(res.mode & 128));
          else if (res.isDirectory()) readDir();
          else doesNot(); // we don't follow symbolic links
        });
      };

      const copyFile = function (readonly: boolean) {
        if (readonly) fileName = "readonly@" + fileName; // eww
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
  sshConnection.on("error", function (error) {
    logger.error("ssh2 connection failed: " + error, client);
    sshConnection.end(); // we don't want more errors produced
    next();
  });
  sshConnection.connect(sshCredentials(client.instance));
};

export { downloadFromInstance };
