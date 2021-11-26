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
  recoverInstances(next: any);
  removeInstanceFromId(clientId: string);
}

export { Instance, InstanceManager };
