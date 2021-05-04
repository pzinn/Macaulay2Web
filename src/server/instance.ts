export interface Instance {
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
