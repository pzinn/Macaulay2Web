import { InstanceManager } from "./instanceManager";
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
    next(false, { ...this.options.credentials, lastActiveTime: Date.now() });
  };

  public recoverInstances(next) {
    // not implemented
    next();
  }
}

const options = {
  serverConfig: {
    baseDirectory: "m2/",
    MATH_PROGRAM_COMMAND:
      "stty cols 1000000000; mkdir -p m2; cd m2; M2MODE=localServer M2 --webapp",
    CONTAINERS(): InstanceManager {
      return new LocalContainerManager();
    },
  },
};

export { options };
