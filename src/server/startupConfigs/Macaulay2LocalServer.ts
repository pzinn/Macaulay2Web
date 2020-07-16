import { InstanceManager } from "../instanceManager";
import { LocalContainerManager } from "../LocalContainerManager";

const options = {
  serverConfig: {
    CONTAINERS(): InstanceManager {
      return new LocalContainerManager();
    },
  },
};

export { options };
