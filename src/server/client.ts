import { Instance } from "./instance";
import { logger } from "./logger";
import crypto = require("crypto");
import ssh2 = require("ssh2");
import { Socket } from "socket.io";
import {
  OutputProtectionState,
  createOutputProtectionState,
} from "./outputProtection";

class Client {
  public saneState: boolean;
  public instance: Instance;
  public sockets: Socket[];
  public savedOutput: string; // previous output
  public savedOutputDropping: boolean;
  public outputProtection: OutputProtectionState;
  public outputLogBytes: number;
  public outputLogChunks: number;
  public outputLogStartedAt: number | null;
  public channel: ssh2.ClientChannel;
  public id: string;
  public controlOutputBuffer: string;
  constructor(newId: string) {
    this.saneState = true;
    this.sockets = [];
    this.savedOutput = "";
    this.savedOutputDropping = false;
    this.outputProtection = createOutputProtectionState();
    this.outputLogBytes = 0;
    this.outputLogChunks = 0;
    this.outputLogStartedAt = null;
    this.id = newId;
    this.controlOutputBuffer = "";
  }
  public fileUploadChunks: Buffer[];
}

interface IClients {
  [clientId: string]: Client;
}

const getNewId = function (clients: IClients) {
  let clientId: string;
  do {
    clientId = crypto
      .randomBytes(6)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  } while (clientId in clients);
  logger.info("New client id " + clientId);
  return clientId;
};

const userSpecificPath = function (clientId: string): string {
  return "files/" + clientId + "-"; // used to be + "/" but we don't bother with subdirectories now
};

export { Client, IClients, getNewId, userSpecificPath };
