import { Instance } from "./instance";
import ssh2 = require("ssh2");

export class Client {
  public saneState: boolean;
  public instance: Instance;
  public sockets: { [socketID: string]: any };
  public results: string[];
  public channel: ssh2.ClientChannel;
  public id: string;
  constructor(newId: string) {
    this.saneState = true;
    this.sockets = {};
    this.results = [];
    this.id = newId;
  }
  public nSockets(): number {
    return Object.keys(this.sockets).length;
  }
}

interface IClients {
  [clientId: string]: Client;
}
export { IClients };
