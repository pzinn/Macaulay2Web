import { Instance } from "./instance";

interface InstanceManager {
  getNewInstance(userId: string, next: any);
  updateLastActiveTime(instance: Instance);
  recoverInstances(next: any);
}

export { InstanceManager };
