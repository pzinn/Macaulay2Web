import { options as globalOptions } from "./global";

const options = {
  ...globalOptions,
  adminName: "pzinn", // to be set live only
  authentication: false,
  serverConfig: {
    CONTAINERS: "../LocalContainerManager",
    MATH_PROGRAM: "Macaulay2",
    MATH_PROGRAM_COMMAND:
      "stty cols 1000000000; M2MODE=default WWWBROWSER=open M2 --webapp",
    port: "8002",
  },
  startInstance: {
    host: "127.0.0.1",
    username: "m2user",
    port: 123,
    sshKey: process.env.HOME + "/Macaulay2Web/id_rsa",
    containerName: "",
    lastActiveTime: 0,
  },
  hostConfig: {
    minContainerAge: 10,
    maxContainerNumber: 256,
    containerType: "m2container",
    sshdCmd: "/usr/sbin/sshd -D",
    dockerCmdPrefix: "sudo ",
    host: "192.168.2.42",
    username: "vagrant",
    port: "22",
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
