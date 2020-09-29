import { webAppTags } from "../../frontend/tags";
import { AuthOption } from "../enums";

const options = {
  cookieName: "Macaulay2Web",
  authentication: AuthOption.none,
  serverConfig: {
    CONTAINERS: "../LocalContainerManager",
    MATH_PROGRAM: "Macaulay2",
    MATH_PROGRAM_COMMAND:
      "stty cols 1000000000; M2MODE=default WWWBROWSER=open M2 --webapp",
    port: 80,
    port2: 443,
    resumeString:
      "Type " +
      webAppTags.Html +
      '<span class="M2PastInput">listUserSymbols</span>' +
      webAppTags.End +
      " to print the list of existing symbols.\n" +
      webAppTags.End +
      "\n" +
      webAppTags.Cell +
      "i* : " +
      webAppTags.Input,
  },
  startInstance: {
    host: "127.0.0.1",
    username: "m2user",
    port: 1000,
    sshKey: process.env.HOME + "/Macaulay2Web/id_rsa",
    containerName: "",
    lastActiveTime: 0,
  },
  perContainerResources: {
    cpuShares: 1,
    memory: 256, // Mb
  },
  hostConfig: {
    minContainerAge: 10,
    maxContainerNumber: 384,
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
