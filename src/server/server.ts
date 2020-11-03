"use strict;";

import { Client } from "./client";
import { IClients } from "./client";
import clientIdHelper from "./clientId";

import { AuthOption, SocketEvent } from "./enums";
import { Instance } from "./instance";
import { InstanceManager } from "./instanceManager";
import { LocalContainerManager } from "./LocalContainerManager";
import { SshDockerContainers } from "./sshDockerContainers";
import { SudoDockerContainers } from "./sudoDockerContainers";
import { AddressInfo } from "net";
import { directDownload } from "./fileDownload";

import * as reader from "./tutorialReader";

import express = require("express");
const app = express();
import httpModule = require("http");
const http = httpModule.createServer(app);
import fs = require("fs");
import Cookie = require("cookie");
import ioModule = require("socket.io");
const io: SocketIO.Server = ioModule(http);
import ssh2 = require("ssh2");
import SocketIOFileUpload = require("socketio-file-upload");

import { webAppTags } from "../frontend/tags";

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

let totalUsers = 0;

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

const disconnectSockets = function (sockets): void {
  for (const socketKey in sockets) {
    if (sockets.hasOwnProperty(socketKey)) {
      const socket: SocketIO.Socket = sockets[socketKey];
      disconnectSocket(socket);
    }
  }
};

const deleteClientData = function (client: Client): void {
  logClient(client.id, "deleting folder " + userSpecificPath(client));
  try {
    logClient(client.id, "Sending disconnect. ");
    disconnectSockets(clients[client.id].socketArray);
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

const emitDataViaSockets = function (
  sockets,
  type: SocketEvent,
  data: string
): void {
  for (const socketKey in sockets) {
    if (sockets.hasOwnProperty(socketKey)) {
      const socket = sockets[socketKey];
      emitDataSafelyViaSocket(socket, type, data);
    }
  }
};

const emitDataSafelyViaSocket = function (
  socket,
  type: SocketEvent,
  data: string
): void {
  try {
    socket.emit(SocketEvent[type], data);
  } catch (error) {
    logger.error(
      "Error while executing socket.emit of type " + SocketEvent[type]
    );
  }
};

const emitDataViaClientSockets = function (
  client: Client,
  type: SocketEvent,
  data
) {
  const s = short(data);
  if (s != "") logClient(client.id, "Sending output: " + s);
  const sockets = client.socketArray;
  emitDataViaSockets(sockets, type, data);
};

const getInstance = function (client: Client, next) {
  if (client.instance) {
    next(client.instance);
  } else {
    try {
      instanceManager.getNewInstance(client.id, function (
        err,
        instance: Instance
      ) {
        if (err) {
          emitDataViaClientSockets(
            client,
            SocketEvent.result,
            "Sorry, there was an error. Please come back later.\n" +
              err +
              "\n\n"
          );
          deleteClientData(client);
        } else {
          next(instance);
        }
      });
    } catch (error) {
      logClient(
        client.id,
        "Could not get new instance. Should not drop in here."
      );
    }
  }
};

export {
  emitDataViaClientSockets,
  serverConfig,
  clients,
  getInstance,
  instanceManager,
  sendDataToClient,
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
  const socketID: string = socket.id;
  client.socketArray[socketID] = socket;
};

const sendDataToClient = function (client: Client) {
  return function (dataObject) {
    const data: string = dataObject.toString();
    if (client.nSockets() === 0) {
      logClient(client.id, "No socket for client.");
      return;
    }
    updateLastActiveTime(client);
    emitDataViaClientSockets(client, SocketEvent.result, data);
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

const getHelp = function (req, res, next) {
  const filePath = decodeURIComponent(req.path);

  fs.readFile(filePath, function (err, data) {
    if (!err) {
      logger.info("Help served");
      res.writeHead(200, {
        "Content-Type": "text/html",
      });
      // work a bit to make it more palatable (maybe one day this will be done by M2 but for now done by server)
      res.write(`<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN">
<html>
  <head>
    <link href='https://fonts.googleapis.com/css?family=Roboto+Mono:regular,medium,bold' rel='stylesheet' type='text/css'/>
    <link rel="stylesheet" href="/katex/katex.css"/>
    <script src="/katex/katex.js"></script>
    <script src="/VectorGraphics/VectorGraphics.js"></script>
    <link rel="stylesheet" href="/VectorGraphics/VectorGraphics.css"/>
    <link rel="stylesheet" href="../../../../Macaulay2/Style/doc.css"/>
    <link rel="stylesheet" href="/minimal.css" type="text/css"/>
    <link href="/prism-M2.css" rel="stylesheet" />
    <script src="/render.js"></script>
  </head>
  <body onload='render("`);
      res.write(data.toString("base64"));
      res.write(`");'>
  </body>
</html>
`);
      res.end();
    } else {
      res.statusCode = 404;
      res.send("404 -- file not found");
    }
  });
};

const adminBroadcast = function (req, res, next) {
  if (req.query.message) {
    logger.info(req.headers.host + " messaged: " + req.query.message);
    let text = req.query.message.replace(/[^a-z0-9 \.,_-]/gim, "");
    if (text === "reboot")
      // common special case
      text =
        "<span style='color:red'>System is going for reboot in 5 minutes. Please save your data.</span>";
    // broadcast
    io.emit(
      "result",
      "\n" + webAppTags.Html + "<h3>" + text + "</h3>" + webAppTags.End + "\n"
    ); // TODO: avoid interference with M2Input
  }
  next();
};

const initializeServer = function () {
  const favicon = require("serve-favicon");
  const serveStatic = require("serve-static");
  const expressWinston = require("express-winston");

  const getList: reader.GetListFunction = reader.tutorialReader(
    staticFolder,
    fs
  );
  const admin = require("./admin")(clients, -1, serverConfig.MATH_PROGRAM);
  app.use(expressWinston.logger(logger));
  app.use(favicon(staticFolder + "favicon.ico"));
  app.use(SocketIOFileUpload.router);
  // help html files get processed
  app.get(/\/usr\/share\/.+\.html/, getHelp);
  // rest is fine
  app.use("/usr/share/", serveStatic("/usr/share")); // optionally, serve documentation locally
  app.use(serveStatic(staticFolder));
  app.use("/admin", adminBroadcast);
  app.use("/admin", admin.stats);
  app.use("/getListOfTutorials", getList);
  app.use(fileDownload);
  app.use(unhandled);
};

const clientExistenceCheck = function (clientId: string, socket): Client {
  logger.info("Checking existence of client with id " + clientId);
  if (!clients[clientId]) {
    clients[clientId] = new Client(clientId);
    totalUsers += 1;
  } else {
    emitDataSafelyViaSocket(
      socket,
      SocketEvent.result,
      serverConfig.resumeString
    );
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
  let shortMsg = msg.substring(0, 77).replace(/[^\x20-\x7F]/g, " ");
  if (msg.length > 77) shortMsg += "...";
  return shortMsg.trim();
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
      sanitizeClient(client, true);
    }
  };
};

const sevenDays = 7 * 86409000;

const initializeClientId = function (socket): string {
  const clientId = clientIdHelper(clients, logger.info).getNewId();
  setCookieOnSocket(socket, clientId);
  return clientId;
};

const setCookieOnSocket = function (socket, clientId: string): void {
  if (clientId.substring(0, 4) === "user") {
    const expDate = new Date(new Date().getTime() + sevenDays);
    const sessionCookie = Cookie.serialize(options.cookieName, clientId, {
      expires: expDate,
    });
    socket.emit("cookie", sessionCookie);
  }
};

const listen = function () {
  io.on("connection", function (socket: SocketIO.Socket) {
    logger.info("Incoming new connection!");
    const publicId = socket.handshake.query.publicId;
    const userId = socket.handshake.query.userId;
    let clientId: string;
    if (publicId !== undefined) {
      clientId = "public" + publicId;
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
    //    socket.on("download", socketDownloadAction(socket, client));
  });

  const listener = http.listen(serverConfig.port);
  logger.info("Server running on " + (listener.address() as AddressInfo).port);
  return listener;
};

const authorizeIfNecessary = function (authOption: AuthOption) {
  if (authOption === AuthOption.basic) {
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

const MathServer = function (o) {
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
      spawnMathProgramInSecureContainer(client);
      totalUsers += 1;
    }
    logger.info("start init");
    initializeServer();
    listen();
  });
};

exports.mathServer = MathServer;
