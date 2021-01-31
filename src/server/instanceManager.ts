import { Instance } from "./instance";

interface InstanceManager {
  getNewInstance(clientId: string, next: any);
  updateLastActiveTime(instance: Instance);
  recoverInstances(next: any);
}

export { InstanceManager };
