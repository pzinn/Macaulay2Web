import { options as globalOptions } from "../common/global";

const options = {
  ...globalOptions,
  adminName: "", // to be set live only
  authentication: false, // overridden anyway depending on existence of public/users.htpasswd
  perContainerResources: {
    cpuShares: 0.5,
    memory: 384, // Mb
    maxSavedOutput: 200000, // size of saved output in bytes
    maxRate: 0.1, // max rate of output per millisecond
    maxPacket: 200000, // max packet size
  },
  serverConfig: {
    MATH_PROGRAM: "Macaulay2",
    MATH_PROGRAM_COMMAND: "stty cols 1000000000; M2MODE=default M2 --webapp",
    port: 80,
    port2: 443,
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
    maxContainerNumber: 384,
    containerType: "m2container",
    sshdCmd: "/usr/sbin/sshd -D",
    dockerCmdPrefix: "sudo ",
    host: "192.168.2.42",
    username: "vagrant",
    instancePort: 1024,
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
