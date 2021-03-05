import fs = require("fs");
import { Client } from "./client";
import ssh2 = require("ssh2");
import SocketIOFileUpload = require("socketio-file-upload");
import { logger, logClient } from "./logger";
import { unlink } from "./server";

const uploadToDocker = function (
  client: Client,
  filePath: string,
  fileName: string,
  sshCredentials
) {
  const credentials = sshCredentials(client.instance);
  const connection: ssh2.Client = new ssh2.Client();
  connection.on("ready", function () {
    connection.sftp(function (err, sftp) {
      if (err) {
        logger.error("There was an error while connecting via sftp: " + err);
        return; // ?
      }
      sftp.fastPut(filePath, fileName, function (sftpError) {
        if (sftpError)
          logger.error(
            "Error while uploading file: " + fileName + ", ERROR: " + sftpError
          );
        unlink(filePath);
      });
    });
  });
  connection.connect(credentials);
};

const completeFileUpload = function (client: Client, sshCredentials) {
  return function (event) {
    const credentials = sshCredentials(client.instance);
    const connection: ssh2.Client = new ssh2.Client();

    connection.on("ready", function () {
      connection.sftp(function (err, sftp) {
        if (err) {
          logger.error("There was an error while connecting via sftp: " + err);
        }
        const stream = sftp.createWriteStream(event.file.name);
        stream.write(Buffer.concat(client.fileUploadChunks));
        stream.end(function () {
          connection.end();
        });
      });
    });

    connection.connect(credentials);
  };
};

const attachUploadListenerToSocket = function (
  sshCredentials,
  client: Client,
  socket: SocketIO.Socket
) {
  const uploader = new SocketIOFileUpload();
  uploader.listen(socket);

  uploader.on("error", function (event) {
    logger.error("Error in upload (" + event.memo + ")" + event.error);
  });

  uploader.on("start", function (event) {
    client.fileUploadChunks = [];
    logClient(
      client,
      "File upload: " + event.file.name + " (" + event.file.encoding + ")"
    );
  });

  uploader.on("progress", function (event) {
    client.fileUploadChunks.push(event.buffer);
  });

  uploader.on("complete", completeFileUpload(client, sshCredentials));
};

export { attachUploadListenerToSocket, uploadToDocker };
