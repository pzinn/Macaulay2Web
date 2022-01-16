import { InstanceManager, Instance } from "./instance";
import childProcess = require("child_process");
const exec = childProcess.exec;

class LocalContainerManager implements InstanceManager {
  private currentInstance: any;

  constructor(resources: any, hostConfig: any, currentInstance: Instance) {
    this.currentInstance = currentInstance;
    exec("whoami", function (error, username) {
      currentInstance.username = username.trim();
    });

    exec("echo $HOME", function (error, homedir) {
      currentInstance.sshKey = homedir.trim() + "/.ssh/id_rsa";
    });
  }

  public getNewInstance = function (clientId: string, next: any) {
    next({ ...this.currentInstance, lastActiveTime: Date.now() });
  };

  public recoverInstances(next) {
    // not implemented
    next();
  }

  public removeInstanceFromId() {
    // not needed
  }
  public checkInstance = function (instance, next) {
    // not needed
    next(false);
  };
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
  },
  startInstance: {
    host: "127.0.0.1",
    port: 22,
    username: undefined,
    sshKey: undefined,
    lastActiveTime: 0,
    numInputs: 0,
  },
  manager: LocalContainerManager,
};

export { options };
