import childProcess = require("child_process");
import fs = require("fs");

import { archiveDockerHome } from "./dockerArchive";
import { waitForDockerSshd } from "./dockerStartup";

interface DockerManagerDependencies {
  exec: typeof childProcess.exec;
  access: typeof fs.access;
  archiveDockerHome: typeof archiveDockerHome;
  waitForDockerSshd: typeof waitForDockerSshd;
}

const defaultDockerManagerDependencies: DockerManagerDependencies = {
  exec: childProcess.exec,
  access: fs.access,
  archiveDockerHome,
  waitForDockerSshd,
};

export { DockerManagerDependencies, defaultDockerManagerDependencies };
