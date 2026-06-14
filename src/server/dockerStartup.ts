import childProcess = require("child_process");

import { Instance } from "./instance";
import { logger } from "./logger";

type ExecFile = typeof childProcess.execFile;

interface DockerStartupOptions {
  retryMs?: number;
  timeoutMs?: number;
}

const waitForDockerSshd = function (
  instance: Instance,
  sshdCommand: string,
  next: (error?: Error) => void,
  options: DockerStartupOptions = {},
  execFile: ExecFile = childProcess.execFile
) {
  const retryMs = options.retryMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 30000;
  const deadline = Date.now() + timeoutMs;

  const check = function () {
    execFile(
      "sudo",
      ["docker", "exec", instance.containerName, "ps", "aux"],
      function (error, stdout, stderr) {
        if (!error && stdout.includes(sshdCommand)) {
          logger.info("sshd is ready in " + instance.containerName);
          next();
          return;
        }

        if (Date.now() >= deadline) {
          const detail = error
            ? String(error)
            : stderr
            ? stderr.trim()
            : "sshd process was not found";
          next(
            new Error(
              "Timed out waiting for sshd in " +
                instance.containerName +
                ": " +
                detail
            )
          );
          return;
        }

        logger.info("sshd not ready yet in " + instance.containerName);
        setTimeout(check, retryMs);
      }
    );
  };

  check();
};

export { waitForDockerSshd };
