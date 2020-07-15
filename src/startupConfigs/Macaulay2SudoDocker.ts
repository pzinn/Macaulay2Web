import { InstanceManager } from "../lib/instanceManager";
import { SudoDockerContainers } from "../lib/sudoDockerContainers";

const options = {
  serverConfig: {
    port: 8002,
    MATH_PROGRAM_COMMAND:
      "export M2MODE=Macaulay2SudoDocker; export WWWBROWSER=open; stty cols 1000000000; M2 --webapp",
    CONTAINERS(resources, hostConfig, guestInstance): InstanceManager {
      return new SudoDockerContainers(resources, hostConfig, guestInstance);
    },
  },
};

export { options };
