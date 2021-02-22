import { Instance } from "./instance";
import ssh2 = require("ssh2");

export class Client {
  public saneState: boolean;
  public instance: Instance;
  public sockets: SocketIO.Socket[];
  public savedOutput: string; // previous output
  public outputStat: number; // an idea of output rate, to prevent flooding
  public channel: ssh2.ClientChannel;
  public id: string;
  constructor(newId: string) {
    this.saneState = true;
    this.sockets = [];
    this.savedOutput = "";
    this.outputStat = 0;
    this.id = newId;
  }
  public fileUploadChunks: Buffer[];
}

interface IClients {
  [clientId: string]: Client;
}
export { IClients };
