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
  clientId: string;
}

interface InstanceManager {
  getNewInstance(clientId: string, next: any);
  recoverInstances(recreate: boolean, next: any);
  removeInstanceFromId(clientId: string, next?);
}

export { Instance, InstanceManager };
