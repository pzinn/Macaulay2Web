import { Instance } from "./instance";
import ssh2 = require("ssh2");

export class Client {
  public saneState: boolean;
  public instance: Instance;
  public sockets: SocketIO.Socket[];
  public output: string;
  public channel: ssh2.ClientChannel;
  public id: string;
  constructor(newId: string) {
    this.saneState = true;
    this.sockets = [];
    this.output = "";
    this.id = newId;
  }
}

interface IClients {
  [clientId: string]: Client;
}
export { IClients };
