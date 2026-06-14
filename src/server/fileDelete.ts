import { Client } from "./client";
import ssh2 = require("ssh2");
import { logger } from "./logger";
import { options, sshCredentials } from "./server";
import { normalizeInstancePath } from "./fileTransferPaths";

const deleteFromInstance = function (client: Client, fileName: string, next) {
  const targetPath = normalizeInstancePath(
    fileName,
    options.serverConfig.baseDirectory
  );
  if (!targetPath || !client.instance || !client.instance.host) {
    return next("Invalid file name.", true);
  }

  const sshConnection: ssh2.Client = new ssh2.Client();
  sshConnection.on("ready", function () {
    sshConnection.sftp(function (err, sftp) {
      if (err) {
        logger.error(
          "There was an error while connecting via sftp: " + err,
          client
        );
        sshConnection.end();
        return next("Could not connect to file system.", true);
      }

      sftp.stat(targetPath, function (statError, stat) {
        if (statError || !stat) {
          sshConnection.end();
          return next("File does not exist.", true);
        }

        const finish = function (deleteError?) {
          sshConnection.end();
          if (deleteError) {
            logger.error(
              "Error while deleting file: " +
                targetPath +
                ", ERROR: " +
                deleteError,
              client
            );
            return next("Delete failed.", true);
          }
          logger.info("Deleted " + targetPath, client);
          next("Deleted " + fileName + ".", false);
        };

        if (stat.isFile()) sftp.unlink(targetPath, finish);
        else if (stat.isDirectory()) sftp.rmdir(targetPath, finish);
        else {
          sshConnection.end();
          next(
            "Only regular files and empty directories can be deleted.",
            true
          );
        }
      });
    });
  });
  sshConnection.on("error", function (error) {
    logger.error("ssh2 connection failed: " + error, client);
    sshConnection.end();
    next("Delete failed due to a connection error.", true);
  });
  sshConnection.connect(sshCredentials(client.instance));
};

export { deleteFromInstance };
