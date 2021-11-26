import { InstanceManager } from "./instance";
import childProcess = require("child_process");
const exec = childProcess.exec;

class LocalContainerManager implements InstanceManager {
  private options: any;

  constructor() {
    const options = {
      credentials: {
        host: "127.0.0.1",
        port: 22,
        username: undefined,
        sshKey: undefined,
      },
    };
    exec("whoami", function (error, username) {
      options.credentials.username = username.trim();
    });

    exec("echo $HOME", function (error, homedir) {
      options.credentials.sshKey = homedir.trim() + "/.ssh/id_rsa";
    });

    this.options = options;
  }

  public getNewInstance = function (clientId: string, next: any) {
    next({ ...this.options.credentials, lastActiveTime: Date.now() });
  };

  public recoverInstances(next) {
    // not implemented
    next();
  }

  public removeInstanceFromId(clientId: string) {
    // not needed
  }
}

const baseDirectory = "m2/";

const options = {
  serverConfig: {
    baseDirectory: baseDirectory,
    MATH_PROGRAM_COMMAND:
      "mkdir -p " +
      baseDirectory +
      "; cd " +
      baseDirectory +
      "; stty -echo; LD_PRELOAD=/usr/lib64/libtagstderr.so M2MODE=localServer M2 --webapp",
    CONTAINERS(): InstanceManager {
      return new LocalContainerManager();
    },
  },
};

export { options };
