"use strict;";

import { Client, IClients } from "./client";
import clientIdHelper from "./clientId";
import { Chat } from "../common/chatClass";
import { Instance } from "./instance";
import { InstanceManager } from "./instanceManager";
import { LocalContainerManager } from "./LocalContainerManager";
import { SshDockerContainers } from "./sshDockerContainers";
import { SudoDockerContainers } from "./sudoDockerContainers";
import { AddressInfo } from "net";
import { directDownload } from "./fileDownload";

import express = require("express");
const app = express();
import httpModule = require("http");
const http = httpModule.createServer(app);
import fs = require("fs");
import Cookie = require("cookie");

import ssh2 = require("ssh2");
import socketioFileUpload = require("socketio-file-upload");

import socketio = require("socket.io");
const io: SocketIO.Server = socketio(http, { pingTimeout: 30000 });

import { webAppTags } from "../common/tags";

const logger = require("./logger");

import path = require("path");
let getClientIdFromSocket;
let serverConfig = {
  MATH_PROGRAM: undefined,
  CMD_LOG_FOLDER: undefined,
  MATH_PROGRAM_COMMAND: undefined,
  resumeString: undefined,
  port: undefined,
  CONTAINERS: undefined,
};
let options;
const staticFolder = path.join(__dirname, "../../public/");

const sshCredentials = function (instance: Instance): ssh2.ConnectConfig {
  return {
    host: instance.host,
    port: instance.port,
    username: instance.username,
    privateKey: fs.readFileSync(instance.sshKey),
  };
};

const clients: IClients = {};

let instanceManager: InstanceManager = {
  getNewInstance(userId: string, next: any) {
    //
  },
  updateLastActiveTime() {
    //
  },
  recoverInstances() {
    //
  },
};

const logClient = function (clientId, str) {
  if (process.env.NODE_ENV !== "test") {
    logger.info(clientId + ": " + str);
  }
};

const userSpecificPath = function (client: Client): string {
  return staticFolder + client.id + "-files/";
};

const disconnectSocket = function (socket: SocketIO.Socket): void {
  try {
    socket.disconnect();
  } catch (error) {
    logger.error("Failed to disconnect socket: " + error);
  }
};

const deleteClientData = function (client: Client): void {
  logClient(client.id, "deleting folder " + userSpecificPath(client));
  try {
    logClient(client.id, "Sending disconnect. ");
    clients[client.id].sockets.forEach(disconnectSocket);
  } catch (error) {
    logClient(client.id, "Socket seems already dead: " + error);
  }
  fs.rmdir(userSpecificPath(client), function (error) {
    if (error) {
      logClient(client.id, "Error deleting user folder: " + error);
    }
  });
  delete clients[client.id];
};

const safeSocketEmit = function (socket, type: string, data): void {
  try {
    socket.emit(type, data);
  } catch (error) {
    logger.error("Error while executing socket.emit of type " + type);
  }
};

const emitOutputViaClientSockets = function (client: Client, data) {
  const s = short(data);
  if (s != "") logClient(client.id, "Sending output: " + s);
  client.sockets.forEach((socket) => safeSocketEmit(socket, "output", data));
};

const getInstance = function (client: Client, next) {
  if (client.instance) {
    next(client.instance);
  } else {
    try {
      instanceManager.getNewInstance(
        client.id,
        function (err, instance: Instance) {
          if (err) {
            emitOutputViaClientSockets(
              client,
              "Sorry, there was an error. Please come back later.\n" +
                err +
                "\n\n"
            );
            deleteClientData(client);
          } else {
            next(instance);
          }
        }
      );
    } catch (error) {
      logClient(
        client.id,
        "Could not get new instance. Should not drop in here."
      );
    }
  }
};

const optLogCmdToFile = function (clientId: string, msg: string) {
  if (serverConfig.CMD_LOG_FOLDER) {
    fs.appendFile(
      serverConfig.CMD_LOG_FOLDER + "/" + clientId + ".log",
      msg,
      function (err) {
        if (err) {
          logClient(clientId, "logging msg failed: " + err);
        }
      }
    );
  }
};

const killNotify = function (client: Client) {
  return function () {
    logClient(client.id, "getting killed.");
    deleteClientData(client);
    optLogCmdToFile(client.id, "Killed.\n");
  };
};

const spawnMathProgramInSecureContainer = function (client: Client) {
  logClient(client.id, "Spawning new MathProgram process...");
  getInstance(client, function (instance: Instance) {
    instance.killNotify = killNotify(client);
    const connection: ssh2.Client = new ssh2.Client();
    connection.on("error", function (err) {
      logClient(
        client.id,
        "Error when connecting. " + err + "; Retrying with new instance."
      );
      // Make sure the sanitizer runs.
      try {
        delete client.instance;
        client.saneState = true;
        sanitizeClient(client);
      } catch (instanceDeleteError) {
        logClient(
          client.id,
          "Error when deleting instance: " + instanceDeleteError
        );
        deleteClientData(client);
      }
    });
    connection
      .on("ready", function () {
        client.instance = instance;
        connection.exec(
          serverConfig.MATH_PROGRAM_COMMAND,
          { pty: true },
          function (err, channel: ssh2.ClientChannel) {
            if (err) {
              throw err;
            }
            optLogCmdToFile(client.id, "Starting.\n");
            channel.on("close", function () {
              connection.end();
            });
            channel.on("end", function () {
              channel.close();
              logClient(
                client.id,
                "Channel to Math program ended, closing connection."
              );
              connection.end();
            });
            attachChannelToClient(client, channel);
          }
        );
      })
      .connect(sshCredentials(instance));
  });
};

const updateLastActiveTime = function (client: Client) {
  try {
    instanceManager.updateLastActiveTime(client.instance);
  } catch (noInstanceError) {
    logClient(client.id, "Found no instance.");
    sanitizeClient(client);
  }
};

const addNewSocket = function (client: Client, socket: SocketIO.Socket) {
  logClient(client.id, "Adding new socket");
  client.sockets.push(socket);
};

const sendDataToClient = function (client: Client) {
  return function (dataObject) {
    const data: string = dataObject.toString();
    if (client.sockets.length === 0) {
      logClient(client.id, "No socket for client.");
      return;
    }
    updateLastActiveTime(client);
    // extra logging for *users* only
    if (client.id.substring(0, 4) === "user") {
      client.output += data;
      while (client.output.length > options.perContainerResources.maxOutput) {
        const m = client.output.match(
          new RegExp(
            webAppTags.Cell +
              "[^" +
              webAppTags.Cell +
              webAppTags.CellEnd +
              "]*" +
              webAppTags.CellEnd
          ) // tricky: because of possible nesting
        );
        if (m === null) break; // give up -- normally, shouldn't happen except transitionally
        client.output =
          client.output.substring(0, m.index) +
          " \u2026\n" +
          client.output.substring(m.index + m[0].length);
      }
    } else client.output = "i* : " + webAppTags.Input;
    emitOutputViaClientSockets(client, data);
  };
};

const attachListenersToOutput = function (client: Client) {
  if (client.channel) {
    client.channel
      .removeAllListeners("data")
      .on("data", sendDataToClient(client));
  }
};

const attachChannelToClient = function (
  client: Client,
  channel: ssh2.ClientChannel
) {
  channel.setEncoding("utf8");
  client.channel = channel;
  attachListenersToOutput(client);
  client.saneState = true;
};

const killMathProgram = function (
  channel: ssh2.ClientChannel,
  clientId: string
) {
  logClient(clientId, "killMathProgramClient.");
  channel.close();
};

const fileDownload = function (request, response, next) {
  const rawCookies = request.headers.cookie;
  if (rawCookies) {
    const cookies = Cookie.parse(rawCookies);
    const id = cookies[options.cookieName];
    if (id && clients[id]) {
      const client = clients[id];
      logger.info("file request from " + id);
      let sourcePath = decodeURIComponent(request.path);
      if (sourcePath.startsWith("/relative/"))
        sourcePath = sourcePath.substring(10); // for relative paths
      directDownload(
        client,
        sourcePath,
        userSpecificPath(client),
        sshCredentials,
        logger.info,
        function (targetPath) {
          if (targetPath) {
            response.sendFile(targetPath);
          } else next();
        }
      );
    } else next();
  } else next();
};

const unhandled = function (request, response) {
  logger.error("Request for something we don't serve: " + request.url);
  response.writeHead(404, "Request for something we don't serve.");
  response.write("404");
  response.end();
};

const initializeServer = function () {
  const favicon = require("serve-favicon");
  const serveStatic = require("serve-static");
  const serveIndex = require("serve-index");
  const expressWinston = require("express-winston");
  serveStatic.mime.define({ "text/plain": ["m2"] }); // declare m2 files as plain text for browsing purposes

  //  const admin = require("./admin")(clients, -1, serverConfig.MATH_PROGRAM); // retired
  app.use(expressWinston.logger(logger));
  app.use(favicon(staticFolder + "favicon.ico"));
  app.use(socketioFileUpload.router);
  app.use("/usr/share/", serveStatic("/usr/share")); // optionally, serve documentation locally
  app.use("/usr/share/", serveIndex("/usr/share")); // allow browsing
  app.use(serveStatic(staticFolder));
  //  app.use("/admin", admin.stats); // retired
  app.use(fileDownload);
  app.use(unhandled);
};

const clientExistenceCheck = function (clientId: string, socket): Client {
  logger.info("Checking existence of client with id " + clientId);
  if (!clients[clientId]) {
    clients[clientId] = new Client(clientId);
  }
  return clients[clientId];
};

const sanitizeClient = function (client: Client, force?: boolean) {
  if (!client.saneState) {
    logClient(client.id, "Is already being sanitized.");
    return false;
  }
  client.saneState = false;

  if (
    force ||
    !client.channel ||
    !client.channel.writable ||
    !client.instance
  ) {
    spawnMathProgramInSecureContainer(client);
    /*
  // Avoid stuck sanitizer.
  setTimeout(function () {
      client.saneState = true;
  }, 2000);
*/
  } else {
    logClient(client.id, "Has mathProgram instance.");
    client.saneState = true;
  }
};

const writeMsgOnStream = function (client: Client, msg: string) {
  client.channel.stdin.write(msg, function (err) {
    if (err) {
      logClient(client.id, "write failed: " + err);
      sanitizeClient(client);
    }
    optLogCmdToFile(client.id, msg);
  });
};

const short = function (msg: string) {
  if (!msg) return "";
  let shortMsg = msg
    .substring(0, 50)
    .replace(/[^\x20-\x7F]/g, " ")
    .trim();
  if (msg.length > 50) shortMsg += "...";
  return shortMsg;
};

const checkAndWrite = function (client: Client, msg: string) {
  if (!client.channel || !client.channel.writable) {
    sanitizeClient(client);
  } else {
    writeMsgOnStream(client, msg);
  }
};

const checkClientSane = function (client: Client) {
  logClient(client.id, "Checking sanity: " + client.saneState);
  return client.saneState;
};

const socketInputAction = function (socket, client: Client) {
  return function (msg: string) {
    logClient(client.id, "Receiving input: " + short(msg));
    if (checkClientSane(client)) {
      setCookieOnSocket(socket, client.id);
      updateLastActiveTime(client);
      checkAndWrite(client, msg);
    }
  };
};

const socketResetAction = function (client: Client) {
  return function () {
    optLogCmdToFile(client.id, "Resetting.\n");
    logClient(client.id, "Received reset.");
    if (checkClientSane(client)) {
      if (client.channel) killMathProgram(client.channel, client.id);
      client.output = "";
      sanitizeClient(client, true);
    }
  };
};

const chatList: Chat[] = []; // used to restore chat
const chatBlackList: string[] = [];
let chatBlock = false;
let chatCounter = 0;

const socketChatAction = function (socket, client: Client) {
  const chatLogin = function (chat: Chat) {
    safeSocketEmit(
      socket,
      "chat",
      chatList.map(function (chat: Chat) {
        if (
          chat.recipients[client.id] === undefined &&
          chat.recipients[""] === undefined
        )
          return {};
        const rec =
          chat.recipients[client.id] === null || chat.recipients[""] === null
            ? null
            : chat.recipients[client.id] === undefined
            ? chat.recipients[""]
            : chat.recipients[""] === undefined
            ? chat.recipients[client.id]
            : chat.recipients[""].concat(chat.recipients[client.id]);
        return Object.assign({}, chat, { recipients: rec, id: undefined });
      })
    ); // provide past chat
    chat.message = chat.alias + " has arrived. Welcome!";
    chat.alias = "System";
    chat.type = "message";
    chat.hash = chatCounter++;
    // send only to userId
    client.sockets.forEach((socket1) => socket1.emit("chat", chat));
  };
  const chatMessage = function (chat: Chat) {
    logClient(client.id, chat.alias + " said: " + short(chat.message));
    chat.hash = chatCounter++;
    chatList.push(chat); // right now, only non system messages logged
    // default: to user
    if (Object.keys(chat.recipients).length == 0)
      chat.recipients[client.id] = null;
    if (chat.recipients[""] !== null)
      chat.recipientsSummary = Object.values(chat.recipients)
        .map((x) => (x === null ? "★" : (x as any).join(", ")))
        .join(" & ");
    // and make sure sender gets a copy
    if (chat.recipients[""] !== null && chat.recipients[client.id] !== null) {
      if (chat.recipients[client.id] === undefined)
        chat.recipients[client.id] = [];
      chat.recipients[client.id].push(chat.alias);
    }
    for (const id1 in chat.recipients) {
      const chat1 = Object.assign({}, chat, {
        recipients: chat.recipients[id1],
      });
      if (id1 == "") io.emit("chat", chat1);
      // broadcast
      else {
        const client1 = clients[id1];
        if (client1) {
          client1.sockets.forEach((socket1) => socket1.emit("chat", chat1));
        }
      }
    }
    chat.id = client.id;
  };
  const chatDelete = function (chat: Chat, index: number) {
    logClient(client.id, chat.alias + " deleted #" + chat.hash);
    chatList.splice(index, 1);
    io.emit("chat", chat);
  };
  const chatAdmin = function (chat: Chat) {
    if (chat.message.startsWith("@block")) {
      const i = chat.message.indexOf(" ");
      if (i < 0) {
        // toggle full block
        chatBlock = !chatBlock;
        chat.message += " (" + chatBlock + ")";
      } else
        chat.message
          .substring(i + 1)
          .split(" ")
          .forEach((name) => {
            const i = chatBlackList.indexOf(name);
            if (i < 0) {
              chatBlackList.push(name);
              chat.message += " (true)";
            } else {
              chatBlackList.splice(i, 1);
              chat.message += " (false)";
            }
          });
    } else {
      // default: list
      chat.message +=
        "\n | id | sockets | output | last | docker | active time ";
      for (const id in clients) {
        chat.message +=
          "\n|" +
          id +
          "|" +
          //
          clients[id].sockets
            .map((x) => x.handshake.address)
            .sort()
            .filter((v, i, o) => v !== o[i - 1])
            .join("\\n") +
          "(" +
          clients[id].sockets.length +
          ")" +
          "|" +
          clients[id].output.length +
          "|\t" +
          clients[id].output
            .substring(clients[id].output.length - 48)
            .replace(/[^ -z{}]/g, " ") +
          "\t|" +
          (clients[id].instance
            ? (clients[id].instance.containerName
                ? clients[id].instance.containerName
                : "") +
              (clients[id].instance.lastActiveTime
                ? "|" +
                  new Date(clients[id].instance.lastActiveTime)
                    .toISOString()
                    .replace("T", " ")
                    .substr(0, 19)
                : "")
            : "");
      }
    }
    safeSocketEmit(socket, "chat", chat);
  };

  return client.id != "user" + options.adminName
    ? function (chat: Chat) {
        // normal user
        logClient(client.id, "chat of type " + chat.type);
        if (
          chat.alias == options.adminAlias ||
          chat.alias == options.systemAlias
        ) {
          logClient(client.id, "tried to impersonate Admin or System");
          chat.alias = options.defaultAlias;
        }
        if (
          chatBlock ||
          chatBlackList.indexOf(client.id) >= 0 ||
          chatBlackList.indexOf(socket.handshake.address) >= 0
        )
          return; // blocked
        if (chat.type == "delete") {
          const index = chatList.findIndex((x) => x.hash === chat.hash); // sigh
          if (
            index < 0 ||
            chatList[index].id != client.id ||
            chatList[index].alias != chat.alias
          )
            return; // false alarm
          chatDelete(chat, index);
        } else if (chat.type === "login") chatLogin(chat);
        else if (chat.type === "message") chatMessage(chat);
      }
    : function (chat: Chat) {
        // admin
        logClient(client.id, "chat of type " + chat.type);
        if (chat.type == "delete") {
          const index = chatList.findIndex((x) => x.hash === chat.hash); // sigh
          if (index < 0) return; // false alarm
          chatDelete(chat, index);
        } else if (chat.type === "login") chatLogin(chat);
        else if (chat.type === "message") {
          if (chat.message[0] == "@") chatAdmin(chat);
          else chatMessage(chat);
        }
      };
};

const socketRestoreAction = function (socket, client: Client) {
  return function () {
    logClient(client.id, "Restoring output");
    safeSocketEmit(socket, "output", client.output); // send previous output
  };
};

const initializeClientId = function (socket): string {
  const clientId = clientIdHelper(clients, logger.info).getNewId();
  setCookieOnSocket(socket, clientId);
  return clientId;
};

const setCookieOnSocket = function (socket, clientId: string): void {
  const expDate = new Date(new Date().getTime() + options.cookieDuration);
  const sessionCookie = Cookie.serialize(options.cookieName, clientId, {
    expires: expDate,
  });
  safeSocketEmit(socket, "cookie", sessionCookie);
};

const validateId = function (s): string {
  if (s === undefined) return undefined;
  s = s.replace(/[^a-zA-Z_0-9]/g, "");
  if (s == "") return undefined;
  else return s;
};

const listen = function () {
  io.on("connection", function (socket: SocketIO.Socket) {
    logger.info("Incoming new connection!");
    const version = socket.handshake.query.version;
    if (options.version && version != options.version) {
      safeSocketEmit(
        socket,
        "output",
        "Client/server version mismatch. Please refresh your page."
      );
      return; // brutal
    }
    const publicId = validateId(socket.handshake.query.publicId);
    const userId = validateId(socket.handshake.query.userId);
    let clientId: string;
    if (publicId !== undefined) {
      clientId = "public";
    } else if (userId !== undefined) {
      clientId = "user" + userId;
      setCookieOnSocket(socket, clientId); // overwrite cookie if necessary
    } else {
      clientId = getClientIdFromSocket(socket);
      if (clientId === undefined)
        // need new one
        clientId = initializeClientId(socket);
    }
    logClient(clientId, "Assigned clientId");
    if (clientId === "deadCookie") {
      logger.info("Disconnecting for dead cookie.");
      disconnectSocket(socket);
      return;
    }
    const client = clientExistenceCheck(clientId, socket);
    sanitizeClient(client);
    addNewSocket(client, socket);
    const fileUpload = require("./fileUpload")(logger.info, sshCredentials);
    fileUpload.attachUploadListenerToSocket(client, socket);
    socket.on("input", socketInputAction(socket, client));
    socket.on("reset", socketResetAction(client));
    socket.on("chat", socketChatAction(socket, client));
    socket.on("restore", socketRestoreAction(socket, client));
  });

  const listener = http.listen(serverConfig.port);
  logger.info("Server running on " + (listener.address() as AddressInfo).port);
  return listener;
};

const authorizeIfNecessary = function (authOption: boolean) {
  if (authOption) {
    const auth = require("http-auth");
    const basic = auth.basic({
      realm: "Please enter your username and password.",
      file: path.join(__dirname, "/../../../public/users.htpasswd"),
    });
    app.use(auth.connect(basic));
    return function (socket: SocketIO.Socket) {
      try {
        return socket.request.headers.authorization.substring(6);
      } catch (error) {
        return "deadCookie";
      }
    };
  }
  return function (socket: SocketIO.Socket) {
    const rawCookies = socket.request.headers.cookie;
    if (typeof rawCookies === "undefined") {
      // Sometimes there are no cookies
      return undefined;
    } else {
      const cookies = Cookie.parse(rawCookies);
      return cookies[options.cookieName];
    }
  };
};

const mathServer = function (o) {
  options = o;
  serverConfig = options.serverConfig;

  if (!serverConfig.CONTAINERS) {
    logger.error("error, no container management given.");
    throw new Error("No CONTAINERS!");
  }

  getClientIdFromSocket = authorizeIfNecessary(options.authentication);
  const resources = options.perContainerResources;
  const guestInstance = options.startInstance;
  const hostConfig = options.hostConfig;
  instanceManager = serverConfig.CONTAINERS(
    resources,
    hostConfig,
    guestInstance
  );

  instanceManager.recoverInstances(function (lst) {
    logger.info("Recovered " + Object.keys(lst).length + " instances");
    for (const clientId in lst) {
      const client = new Client(clientId);
      clients[clientId] = client;
      client.instance = lst[clientId];
      //      spawnMathProgramInSecureContainer(client);
    }
    logger.info("start init");
    initializeServer();
    listen();
  });
};

export { mathServer };
