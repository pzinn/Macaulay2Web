import childProcess = require("child_process");
import fs = require("fs");

import { Instance } from "./instance";
import { logger } from "./logger";

type ArchiveCallback = (error?: Error) => void;
type Spawn = typeof childProcess.spawn;

const isDockerContainerMissingError = function (error: unknown): boolean {
  if (!error) return false;
  const detail =
    error instanceof Error
      ? error.message + " " + String((error as any).stderr || "")
      : String(error);
  return /No such (?:container|object):/i.test(detail);
};

const removeTemporaryArchive = function (
  temporaryPath: string,
  next: () => void
) {
  fs.unlink(temporaryPath, function (error) {
    if (error && error.code !== "ENOENT")
      logger.warn(
        "Unable to remove temporary container archive " +
          temporaryPath +
          ": " +
          error
      );
    next();
  });
};

const archiveDockerHome = function (
  instance: Instance,
  savePath: string,
  next: ArchiveCallback,
  spawn: Spawn = childProcess.spawn
) {
  const temporaryPath = savePath + ".tmp";
  logger.info("Saving container " + instance.containerName + " to " + savePath);

  fs.open(temporaryPath, "w", function (openError, fd) {
    if (openError) return next(openError);

    const output = fs.createWriteStream(temporaryPath, {
      fd,
      autoClose: true,
    });
    const archive = spawn(
      "sudo",
      [
        "docker",
        "exec",
        instance.containerName,
        "tar",
        "--exclude=./.*",
        "--exclude=./tutorials",
        "-C",
        "/home/" + instance.username,
        "-czf",
        "-",
        ".",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let archiveFinished = false;
    let outputFinished = false;
    let settled = false;
    let stderr = "";

    const fail = function (error: Error) {
      if (settled) return;
      settled = true;
      archive.stdout.unpipe(output);
      output.destroy();
      if (!archive.killed) archive.kill();
      removeTemporaryArchive(temporaryPath, function () {
        next(error);
      });
    };

    const finish = function () {
      if (settled || !archiveFinished || !outputFinished) return;
      settled = true;
      fs.rename(temporaryPath, savePath, function (renameError) {
        if (renameError)
          return removeTemporaryArchive(temporaryPath, function () {
            next(renameError);
          });
        logger.info(
          "Saved container " + instance.containerName + " to " + savePath
        );
        next();
      });
    };

    archive.stderr.on("data", function (data) {
      if (stderr.length < 8192) stderr += data.toString();
    });
    archive.on("error", fail);
    archive.on("close", function (code, signal) {
      if (code !== 0) {
        const detail = signal
          ? "signal " + signal
          : "exit code " + String(code);
        const stderrDetail = stderr.trim() ? ": " + stderr.trim() : "";
        fail(new Error("docker exec failed with " + detail + stderrDetail));
        return;
      }
      archiveFinished = true;
      finish();
    });
    output.on("error", fail);
    output.on("finish", function () {
      outputFinished = true;
      finish();
    });
    archive.stdout.pipe(output);
  });
};

export { archiveDockerHome, isDockerContainerMissingError };
