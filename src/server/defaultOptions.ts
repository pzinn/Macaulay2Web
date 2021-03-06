import { options as globalOptions } from "../common/global";

const options = {
  ...globalOptions,
  adminName: "pzinn", // to be set live only
  authentication: false, // overridden anyway depending on existence of public/users.htpasswd
  perContainerResources: {
    cpuShares: 1,
    memory: 384, // Mb
    maxSavedOutput: 200000, // size of saved output in bytes
    maxOutputRate: 0.01, // max rate of output per millisecond
    maxOutputStat: 1000, // # outputs before error thrown
  },
  serverConfig: {
    MATH_PROGRAM: "Macaulay2",
    MATH_PROGRAM_COMMAND: "stty cols 1000000000; M2 --webapp",
    port: 8002,
    baseDirectory: "", // to change the directory in which M2 is started & files are up/downloaded
  },
  startInstance: {
    host: "127.0.0.1",
    username: "m2user",
    sshKey: process.env.HOME + "/Macaulay2Web/id_rsa",
    containerName: "",
    lastActiveTime: 0,
  },
  hostConfig: {
    minContainerAge: 10,
    maxContainerNumber: 400,
    containerType: "m2container",
    sshdCmd: "/usr/sbin/sshd -D",
    dockerCmdPrefix: "sudo ",
    host: "192.168.2.42",
    username: "vagrant",
    instancePort: 1000,
    port: 22,
    sshKey: process.env.HOME + "/keys/host_key",
  },
};

const overrideDefaultOptions = function (overrideOptions, defaultOptions) {
  for (const opt in overrideOptions) {
    if (
      defaultOptions.hasOwnProperty(opt) &&
      defaultOptions[opt] instanceof Object
    ) {
      overrideDefaultOptions(overrideOptions[opt], defaultOptions[opt]);
    } else {
      defaultOptions[opt] = overrideOptions[opt];
    }
  }
};

export { options, overrideDefaultOptions };
