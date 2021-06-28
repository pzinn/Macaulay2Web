// import { Instance } from "./instance";

interface InstanceManager {
  getNewInstance(clientId: string, next: any);
  recoverInstances(next: any);
}

export { InstanceManager };
