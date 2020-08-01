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
import {
  //  emitUrlForUserGeneratedFileToClient,
  directDownload,
} from "./fileDownload";

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
//let myLogger;

const logExceptOnTest = function (msg: string): void {
  if (process.env.NODE_ENV !== "test") {
    console.log("[" + new Date().toString() + "] " + msg);
  }
};

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

const logClient = function (clientID, str) {
  if (process.env.NODE_ENV !== "test") {
    logExceptOnTest(clientID + ": " + str);
  }
};

const userSpecificPath = function (client: Client): string {
  return staticFolder + client.id + "-files/";
};

const disconnectSocket = function (socket: SocketIO.Socket): void {
  try {
    socket.disconnect();
  } catch (error) {
    logExceptOnTest("Failed to disconnect socket: " + error);
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
    logExceptOnTest(
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
      logClient(client.id, "Error, no socket for client.");
      return;
    }
    updateLastActiveTime(client);
    /*
	const pathPrefix: string = staticFolder + "-" + serverConfig.MATH_PROGRAM;
    const specialUrlEmitter = require("./specialUrlEmitter")(
      pathPrefix,
      sshCredentials,
      logExceptOnTest,
      emitDataViaSockets,
      options,
    );
    const dataMarkedAsSpecial = specialUrlEmitter.isSpecial(data);
    if (dataMarkedAsSpecial !== false) {
      specialUrlEmitter.emitEventUrlToClient(
        client,
        dataMarkedAsSpecial,
        data,
        userSpecificPath(client),
      );
      return;
      }
    myLogger.log({
      level: "info",
      message: data,
      cat: "output",
      id: client.id,
    });
      */
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
  setTimeout(function () {
    client.saneState = true;
  }, 2000); // Always need a little time before start is done.
};

const killMathProgram = function (
  channel: ssh2.ClientChannel,
  clientID: string
) {
  logClient(clientID, "killMathProgramClient.");
  channel.close();
};

const fileDownload = function (request, response, next) {
  const rawCookies = request.headers.cookie;
  if (rawCookies) {
    const cookies = Cookie.parse(rawCookies);
    const id = cookies[options.cookieName];
    if (id && clients[id]) {
      const client = clients[id];
      logExceptOnTest("that was " + id);
      let sourcePath = decodeURIComponent(request.path);
      if (sourcePath.startsWith("/relative/"))
        sourcePath = sourcePath.substring(10); // for relative paths
      directDownload(
        client,
        sourcePath,
        userSpecificPath(client),
        sshCredentials,
        logExceptOnTest,
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
  logExceptOnTest("Request for something we don't serve: " + request.url);
  response.writeHead(404, "Request for something we don't serve.");
  response.write("404");
  response.end();
};
/*
// the old way: just redirect help with
// app.use("/usr/share/doc/Macaulay2",getHelp);
const getHelp = function(req, res, next) {
    console.log("redirecting help");
    res.redirect(301, 'http://www2.macaulay2.com/Macaulay2/doc/Macaulay2/share/doc/Macaulay2'+req.path);
    }
*/
const getHelp = function (req, res, next) {
  if (req.query.force === undefined) {
    console.log("help served");
    res.sendFile(staticFolder + "help.html");
  } else next();
};

const adminBroadcast = function (req, res, next) {
  if (req.query.message) {
    console.log(
      "[" +
        new Date().toString() +
        "] " +
        req.headers.host +
        " messaged: " +
        req.query.message
    );
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
  const winston = require("winston");
  const expressWinston = require("express-winston");

  /*
  const webAppTagsRegExp = new RegExp(
    "(" + Object.values(webAppTags).join("|") + ")",
    "g"
  );
  const prettyTags = {};
  const temp = Object.entries(webAppTags);
  for (const a of temp) prettyTags[a[1] as any] = "<" + a[0] + ">";

  const myFormat = winston.format.printf((info) => {
    const msg = info.message.replace(webAppTagsRegExp, function (match, token) {
      return prettyTags[token];
    });
    return `${info.cat} to ${info.id}\n${msg}`;
  });

  myLogger = winston.createLogger({
    // custom logger (as opposed to express winston)
    level: "info",
    format: myFormat,
    transports: [
      new winston.transports.File({
        filename: "winston.log",
      }),
    ],
  });
*/
  const loggerSettings = {
    transports: [new winston.transports.Console()],
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  };

  const getList: reader.GetListFunction = reader.tutorialReader(
    staticFolder,
    fs
  );
  const admin = require("./admin")(clients, -1, serverConfig.MATH_PROGRAM);
  app.use(expressWinston.logger(loggerSettings));
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
  logExceptOnTest("Checking existence of client with id " + clientId);
  if (!clients[clientId]) {
    clients[clientId] = new Client(clientId);
    totalUsers += 1;
  } else {
    emitDataSafelyViaSocket(
      socket,
      SocketEvent.result,
      "Session resumed.\n" + serverConfig.resumeString
    );
  }
  return clients[clientId];
};

const sanitizeClient = function (client: Client) {
  if (!client.saneState) {
    logClient(client.id, "Is already being sanitized.");
  }
  client.saneState = false;

  if (!client.channel || !client.channel.writable || !client.instance) {
    spawnMathProgramInSecureContainer(client);
  } else {
    logClient(client.id, "Has mathProgram instance.");
    client.saneState = true;
  }
  // Avoid stuck sanitizer.
  setTimeout(function () {
    client.saneState = true;
  }, 2000);
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

const checkClientSanity = function (client: Client) {
  logClient(client.id, "Checking sanity");
  return new Promise(function (resolve, reject) {
    if (client.saneState) {
      logClient(client.id, "Is sane");
      resolve();
    } else {
      logClient(client.id, "Not accepting events.");
      reject();
    }
  }).catch(() => {
    // empty
  });
};

const socketInputAction = function (socket, client: Client) {
  return function (msg: string) {
    logClient(client.id, "Receiving input: " + short(msg));
    checkClientSanity(client).then(function () {
      setCookieOnSocket(socket, client.id);
      updateLastActiveTime(client);
      checkAndWrite(client, msg);
    });
  };
};

const socketResetAction = function (client: Client) {
  return function () {
    optLogCmdToFile(client.id, "Resetting.\n");
    logClient(client.id, "Received reset.");
    checkClientSanity(client).then(function () {
      if (client.channel) {
        killMathProgram(client.channel, client.id);
        spawnMathProgramInSecureContainer(client);
      }
      //      sanitizeClient(client);
    });
  };
};

/*
const socketDownloadAction = function (socket, client: Client) {
  const pathPrefix: string = staticFolder + "-" + serverConfig.MATH_PROGRAM;
  return function (msg: string) {
    emitUrlForUserGeneratedFileToClient(
      client,
      msg,
      pathPrefix,
      userSpecificPath(client),
      sshCredentials,
      logExceptOnTest,
      emitDataViaSockets
    );
  };
};
*/

const sevenDays = 7 * 86409000;

const initializeClientId = function (socket): string {
  const clientID = clientIdHelper(clients, logExceptOnTest).getNewId();
  setCookieOnSocket(socket, clientID);
  return clientID;
};

const setCookieOnSocket = function (socket, clientID: string): void {
  const expDate = new Date(new Date().getTime() + sevenDays);
  const sessionCookie = Cookie.serialize(options.cookieName, clientID, {
    expires: expDate,
    sameSite: "none",
    secure: true,
  });
  socket.emit("cookie", sessionCookie);
};

const listen = function () {
  io.on("connection", function (socket: SocketIO.Socket) {
    logExceptOnTest("Incoming new connection!");
    let clientId: string = getClientIdFromSocket(socket);
    if (typeof clientId === "undefined") {
      clientId = initializeClientId(socket);
    }
    logClient(clientId, "Assigned clientID");
    if (clientId === "deadCookie") {
      logExceptOnTest("Disconnecting for dead cookie.");
      disconnectSocket(socket);
      return;
    }
    const client = clientExistenceCheck(clientId, socket);
    sanitizeClient(client);
    addNewSocket(client, socket);
    const fileUpload = require("./fileUpload")(logExceptOnTest, sshCredentials);
    fileUpload.attachUploadListenerToSocket(client, socket);
    socket.on("input", socketInputAction(socket, client));
    socket.on("reset", socketResetAction(client));
    //    socket.on("download", socketDownloadAction(socket, client));
  });

  const listener = http.listen(serverConfig.port);
  logExceptOnTest(
    "Server running on " + (listener.address() as AddressInfo).port
  );
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
    console.error("error, no container management given.");
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
    console.log("Recovered " + JSON.stringify(lst) + " instances");
    for (const clientId in lst) {
      const client = new Client(clientId);
      clients[clientId] = client;
      client.instance = lst[clientId];
      spawnMathProgramInSecureContainer(client);
      totalUsers += 1;
    }
    console.log("start init");
    initializeServer();
  });

  // These are the methods available from the outside:
  return {
    listen,
    close() {
      http.close();
    },
  };
};

exports.mathServer = MathServer;
