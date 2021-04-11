import { IClients } from "./client";

const exists = function (clientId: string, clients: IClients, logFunction) {
  if (clientId in clients) {
    logFunction("Client already exists");
    return true;
  }
  return false;
};

export default function clientIdHelper(clients: IClients, logFunction) {
  return {
    getNewId() {
      let clientId: string;
      do {
        clientId = <string>(<any>Math.floor(Math.random() * 1000000));
      } while (exists(clientId, clients, logFunction));
      logFunction("New Client ID " + clientId);
      return clientId;
    },
  };
}
