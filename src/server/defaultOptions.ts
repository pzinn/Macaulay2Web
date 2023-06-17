import { options as globalOptions } from "../common/global";

const adminName = "pzinn"; // to be set live only

const options = {
  ...globalOptions,
  adminName,
  premiumList: [adminName, "test"], // possibly more users having extra privileges
  authentication: false, // overridden anyway depending on existence of public/users.htpasswd
  recreate: false, // try to recreate existing dockers
  perContainerResources: {
    cpuShares: 1,
    memory: 384, // Mb
    maxSavedOutput: 200000, // size of saved output in bytes
    maxOutputRate: 0.01, // max rate of output per millisecond
    maxOutputStat: 2000, // # outputs before error thrown
  },
  serverConfig: {
    m2Prefixes: {
      stty: "stty -echo;",
      //      tagstderr: "LD_PRELOAD=/usr/lib64/libtagstderr.so ", // should be last
    },
    m2Command: "M2 --webapp",
    port: 8002,
    baseDirectory: "", // to change the directory in which M2 is started & files are up/downloaded
    mode: undefined,
  },
  startInstance: {
    host: "127.0.0.1",
    username: "m2user",
    sshKey: process.env.HOME + "/Macaulay2Web/id_rsa",
    containerName: "",
    lastActiveTime: 0,
    numInputs: 0,
    port: 1000,
  },
  hostConfig: {
    minContainerAge: 10 * 1000 * 60, // 10 mins
    maxContainerNumber: 400,
    containerType: "m2container",
    sshdCmd: "/usr/sbin/sshd -D",
    dockerCmdPrefix: "sudo ",
    host: "192.168.2.42",
    username: "vagrant",
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
