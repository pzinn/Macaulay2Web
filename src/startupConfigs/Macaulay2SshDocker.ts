import { InstanceManager } from "../lib/instanceManager";
import { SshDockerContainers } from "../lib/sshDockerContainers";

const options = {
  serverConfig: {
    port: 8002,
    MATH_PROGRAM: "Macaulay2",
    MATH_PROGRAM_COMMAND:
      "export WWWBROWSER=open; stty cols 1000000000; M2 --webapp",
    CONTAINERS(resources, hostConfig, guestInstance): InstanceManager {
      return new SshDockerContainers(resources, hostConfig, guestInstance);
    },
  },
  startInstance: {
    host: "192.168.2.42",
    username: "m2user",
    port: "5000",
    sshKey: process.env.HOME + "/keys/docker_key",
    containerName: "",
    lastActiveTime: 0,
  },
};

export { options };
