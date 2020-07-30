import { InstanceManager } from "../instanceManager";
import { SudoDockerContainers } from "../sudoDockerContainers";

const options = {
  serverConfig: {
    MATH_PROGRAM_COMMAND:
      "stty cols 1000000000; M2MODE=Macaulay2SudoDocker WWWBROWSER=open M2 --webapp",
    CONTAINERS(resources, hostConfig, guestInstance): InstanceManager {
      return new SudoDockerContainers(resources, hostConfig, guestInstance);
    },
  },
};

export { options };
