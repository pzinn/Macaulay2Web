let ssh2 = require("ssh2"); // tslint:disable-line
import fs = require("fs");
import {Client} from "./client";
import {SocketEvent} from "./enums";


const unlink = function(completePath: string) {
  return function() {
    fs.unlink(completePath, function(err) {
      if (err) {
        console.error("Error unlinking user generated file " +
            completePath);
        console.error(err);
      }
    });
  };
};

const emitUrlForUserGeneratedFileToClient = function(client : Client, // tslint:disable-line
                                                   path: string,
                                                   pathPrefix: string,
                                                   pathPostfix: string,
                                                   sshCredentials,
                                                   logFunction,
                                                   emitDataViaSockets) {
  const fileName: string = path;
  if (!fileName) {
    return;
  }
  const sshConnection = ssh2();
  sshConnection.on("end", function() {
    logFunction("Image action ended.");
  });

  const handleUserGeneratedFile = function(generateError, sftp) {
    if (generateError) {
      throw new Error("ssh2.sftp() failed: " + generateError);
    }
    const targetPath: string = pathPrefix + pathPostfix;
      fs.mkdir(targetPath, function(fsError) {
	  if (fsError) {
	      if (fsError.code !== 'EEXIST')
		  console.error("Error creating directory: "+targetPath);
	      else
		  logFunction("Folder exists");
	  }
      console.log("File we want is " + path);
      const completePath = targetPath + fileName;
      sftp.fastGet(path, completePath, function(sftpError) {
        if (sftpError) {
          console.error("Error while downloading file. PATH: " +
              path + ", ERROR: " + sftpError);
        } else {
          setTimeout(unlink(completePath), 1000 * 60 * 10);
          emitDataViaSockets(client.socketArray,
            SocketEvent.image, pathPostfix + fileName,
          );
        }
      });
    });
  };
  sshConnection.on("ready", function() {
    sshConnection.sftp(handleUserGeneratedFile);
  });

  sshConnection.connect(sshCredentials(client.instance));
};

export { emitUrlForUserGeneratedFileToClient };
