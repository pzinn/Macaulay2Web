import { Instance } from "./instance";
import { logger } from "./logger";
import ssh2 = require("ssh2");
import { Socket } from "socket.io";

class Client {
  public saneState: boolean;
  public instance: Instance;
  public sockets: Socket[];
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

const getNewId = function (clients: IClients) {
  let clientId: string;
  do {
    clientId = String(Math.floor(Math.random() * 1000000));
  } while (clientId in clients);
  logger.info("New client id " + clientId);
  return clientId;
};

const userSpecificPath = function (clientId: string): string {
  return "files/" + clientId;
};

export { Client, IClients, getNewId, userSpecificPath };
