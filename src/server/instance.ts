interface Instance {
  host: string;
  port: number;
  username: string;
  sshKey: string;
  containerName?: string;
  lastActiveTime: number;
  numInputs: number;
  containerId?: string;
  killNotify?: () => void;
  removalInProgress?: boolean;
  removalCallbacks?: InstanceRemovalCallback[];
  clientId: string;
}

type InstanceCallback = (instance: Instance) => void;
type InstanceRemovalCallback = (error?: Error) => void;

interface InstanceManager {
  getNewInstance(clientId: string, next: InstanceCallback);
  recoverInstances(next: any);
  removeInstanceFromId(clientId: string, next?: InstanceRemovalCallback);
  checkInstance(instance: Instance, next: any);
}

export { Instance, InstanceCallback, InstanceManager, InstanceRemovalCallback };
