import { InstanceManager } from "../instanceManager";
import { SshDockerContainers } from "../sshDockerContainers";

const options = {
  serverConfig: {
    port: 8002,
    MATH_PROGRAM: "Macaulay2",
    MATH_PROGRAM_COMMAND:
      "stty cols 1000000000; M2MODE=Macaulay2SshDocker WWWBROWSER=open M2 --webapp",
    CONTAINERS(resources, hostConfig, guestInstance): InstanceManager {
      return new SshDockerContainers(resources, hostConfig, guestInstance);
    },
  },
  startInstance: {
    host: "192.168.2.42",
    username: "m2user",
    port: "5000",
    sshKey: process.env.HOME + "/keys/docker_key",
  },
};

export { options };
