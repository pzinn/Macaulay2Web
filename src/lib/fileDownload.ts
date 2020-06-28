const ssh2 = require("ssh2");
import fs = require("fs");
import { Client } from "./client";
import { SocketEvent } from "./enums";
import path = require("path");

const unlink = function (completePath: string) {
  return function () {
    fs.unlink(completePath, function (err) {
      if (err) {
        console.error("Error unlinking user generated file " + completePath);
        console.error(err);
      }
    });
  };
};

const directDownload = function (
  client: Client,
  sourcePath: string,
  pathPrefix: string,
  pathPostfix: string,
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
    const targetPath: string = pathPrefix + pathPostfix;
    fs.mkdir(targetPath, function (fsError) {
      if (fsError) {
        if (fsError.code !== "EEXIST")
          console.error("Error creating directory: " + targetPath);
        else logFunction("Folder exists");
      }
      console.log("File we want is " + sourcePath);
      const completePath = targetPath + fileName;
      sftp.fastGet(sourcePath, completePath, function (sftpError) {
        if (sftpError) {
          console.error(
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

/*
const emitUrlForUserGeneratedFileToClient = function (
  client: Client,
  sourcePath: string,
  pathPrefix: string,
  pathPostfix: string,
  sshCredentials,
  logFunction,
  emitDataViaSockets
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
    const targetPath: string = pathPrefix + pathPostfix;
    fs.mkdir(targetPath, function (fsError) {
      if (fsError) {
        if (fsError.code !== "EEXIST")
          console.error("Error creating directory: " + targetPath);
        else logFunction("Folder exists");
      }
      console.log("File we want is " + sourcePath);
      const completePath = targetPath + fileName;
      sftp.fastGet(sourcePath, completePath, function (sftpError) {
        if (sftpError) {
          console.error(
            "Error while downloading file. PATH: " +
              sourcePath +
              ", ERROR: " +
              sftpError
          );
        } else {
          setTimeout(unlink(completePath), 1000 * 60 * 10);
          emitDataViaSockets(
            client.socketArray,
            SocketEvent.file,
            pathPostfix + fileName
          );
        }
      });
    });
  };
  sshConnection.on("ready", function () {
    sshConnection.sftp(handleUserGeneratedFile);
  });

  sshConnection.connect(sshCredentials(client.instance));
};


    export { emitUrlForUserGeneratedFileToClient, directDownload };
    */

export { directDownload };
