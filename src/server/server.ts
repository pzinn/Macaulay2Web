"use strict;";

import { Client, IClients } from "./client";
import clientIdHelper from "./clientId";
import { socketChatAction, systemChat } from "./chat";
import { Instance } from "./instance";
import { InstanceManager } from "./instanceManager";
import { AddressInfo } from "net";
import { downloadFromDocker } from "./fileDownload";
import { uploadToDocker } from "./fileUpload";

import Cookie = require("cookie");

import express = require("express");
const app = express();
//import httpModule = require("http");
//const http = httpModule.createServer(app);
import fs = require("fs");
import multer = require("multer");
const upload = multer({
  dest: "/tmp/",
  preservePath: true,
  limits: { fieldSize: 1000, fields: 10, fileSize: 1024 * 1024, files: 100 },
});
import ssh2 = require("ssh2");

import socketio = require("socket.io");
let io: SocketIO.Server; // = socketio(http, { pingTimeout: 30000 });

const greenlock = require("greenlock-express");

import { webAppTags } from "../common/tags";

import { logger, logClient } from "./logger";

import path = require("path");
let getClientId;
let serverConfig = {
  MATH_PROGRAM: undefined,
  CMD_LOG_FOLDER: undefined,
  MATH_PROGRAM_COMMAND: undefined,
  resumeString: undefined,
  port: undefined,
  port2: undefined,
  CONTAINERS: undefined,
};
let options;
const staticFolder = path.join(__dirname, "../../public/");

const sshCredentials = function (instance: Instance): ssh2.ConnectConfig {
  if (instance)
    return {
      host: instance.host,
      port: instance.port,
      username: instance.username,
      privateKey: fs.readFileSync(instance.sshKey),
    };
};

const clients: IClients = {};

let instanceManager: InstanceManager;

const disconnectSocket = function (socket: SocketIO.Socket): void {
  try {
    socket.disconnect();
  } catch (error) {
    logger.error("Failed to disconnect socket: " + error);
  }
};

const deleteClientData = function (client: Client): void {
  /*  logClient(client, "deleting folder " + userSpecificPath(client));
  fs.rmdir(userSpecificPath(client), function (error) {
    if (error) {
      logClient(client, "Error deleting user folder: " + error);
    }
  });*/
  try {
    logClient(client, "Sending disconnect. ");
    clients[client.id].sockets.forEach(disconnectSocket);
  } catch (error) {
    logClient(client, "Socket seems already dead: " + error);
  }
  delete clients[client.id];
};

const safeEmit = function (
  target: SocketIO.Socket | SocketIO.Server,
  type: string,
  data
): void {
  try {
    target.emit(type, data);
  } catch (error) {
    logger.error("Error while executing SocketIO emit of type " + type);
  }
};

const emitViaClientSockets = function (client: Client, type: string, data) {
  const s = short(data.toString());
  logClient(client, "Sending " + type + ": " + s);
  client.sockets.forEach((socket) => safeEmit(socket, type, data));
};

const getInstance = function (client: Client, next) {
  if (client.instance) {
    next();
  } else {
    try {
      instanceManager.getNewInstance(
        client.id,
        function (err, instance: Instance) {
          if (err) {
            systemChat(
              client,
              "Sorry, there was an error. Please come back later.\n" + err
            );
            deleteClientData(client);
          } else {
            client.instance = instance;
            client.instance.killNotify = killNotify(client); // what is this for???
            next();
          }
        }
      );
    } catch (error) {
      logClient(client, "Could not get new instance. Should not drop in here.");
    }
  }
};

const killNotify = function (client: Client) {
  return function () {
    logClient(client, "getting killed.");
    deleteClientData(client);
  };
};

const spawnMathProgram = function (client: Client) {
  logClient(client, "Spawning new MathProgram process...");
  getInstance(client, function () {
    const connection: ssh2.Client = new ssh2.Client();
    connection.on("error", function (err) {
      logClient(
        client,
        "Error when connecting. " + err + "; Retrying with new instance."
      );
      // Make sure the sanitizer runs.
      try {
        delete client.instance;
        client.saneState = true;
        sanitizeClient(client);
      } catch (instanceDeleteError) {
        logClient(
          client,
          "Error when deleting instance: " + instanceDeleteError
        );
        deleteClientData(client);
      }
    });
    connection
      .on("ready", function () {
        connection.exec(
          serverConfig.MATH_PROGRAM_COMMAND,
          { pty: true },
          function (err, channel: ssh2.ClientChannel) {
            if (err) {
              throw err;
            }
            channel.on("close", function () {
              connection.end();
            });
            channel.on("end", function () {
              channel.close();
              logClient(
                client,
                "Channel to Math program ended, closing connection."
              );
              connection.end();
            });
            attachChannelToClient(client, channel);
          }
        );
      })
      .connect(sshCredentials(client.instance));
  });
};

const addNewSocket = function (client: Client, socket: SocketIO.Socket) {
  logClient(client, "Adding new socket");
  client.sockets.push(socket);
};

const socketDisconnectAction = function (
  socket: SocketIO.Socket,
  client: Client
) {
  return function () {
    logClient(client, "Removing socket");
    const index = client.sockets.indexOf(socket);
    if (index >= 0) client.sockets.splice(index, 1);
  };
};

const sendDataToClient = function (client: Client) {
  return function (dataObject) {
    if (client.outputStat < 0) return; // output rate exceeded
    if (!client.instance) {
      logClient(client, "No instance for client.");
      return;
    }
    const data: string = dataObject.toString();
    // new: prevent flooding
    client.outputStat +=
      1 +
      0.002 * data.length +
      options.perContainerResources.maxOutputRate *
        (client.instance.lastActiveTime - Date.now());
    client.instance.lastActiveTime = Date.now();
    if (client.outputStat < 0) client.outputStat = 0;
    else if (client.outputStat > options.perContainerResources.maxOutputStat) {
      systemChat(client, "Output rate exceeded. Killing M2.");
      killMathProgram(client);
      client.outputStat = -1; // signal to avoid repeat message
      emitViaClientSockets(client, "output", webAppTags.CellEnd + "\n"); // to make it look nicer
      return;
    }
    client.savedOutput += data;
    // extra logging for *users* only
    if (client.id.substring(0, 4) === "user") {
      while (
        client.savedOutput.length > options.perContainerResources.maxSavedOutput
      ) {
        const m = client.savedOutput.match(
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
        client.savedOutput =
          client.savedOutput.substring(0, m.index) +
          " \u2026\n" +
          client.savedOutput.substring(m.index + m[0].length);
      }
    } else {
      const i = client.savedOutput.lastIndexOf(webAppTags.Cell);
      client.savedOutput =
        i < 0 ||
        client.savedOutput.length - i >
          options.perContainerResources.maxSavedOutput
          ? ""
          : client.savedOutput.substring(i);
      //client.savedOutput = webAppTags.Cell + "i* : " + webAppTags.Input; // a little better than that: keeps last cell
    }
    emitViaClientSockets(client, "output", data);
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

const killMathProgram = function (client: Client) {
  logClient(client, "killMathProgramClient.");
  client.channel.close();
};

const fileDownload = function (request, response, next) {
  // try to find user's id
  const rawCookies = request.headers.cookie;
  if (!rawCookies) return next();
  const cookies = Cookie.parse(rawCookies);
  const id = cookies[options.cookieInstanceName];
  if (!id || !clients[id]) return next();
  const client = clients[id];
  logger.info("File request from " + id);
  const sourcePath = decodeURIComponent(request.path);
  downloadFromDocker(client, sourcePath, sshCredentials, function (targetPath) {
    if (targetPath) {
      response.sendFile(staticFolder + targetPath);
    } else next();
  });
};

const unlink = function (completePath: string) {
  return function () {
    fs.unlink(completePath, function (err) {
      if (err) {
        logger.warn(
          "Unable to unlink user generated file " + completePath + " : " + err
        );
      }
    });
  };
};

const fileUpload = function (request, response) {
  const id = request.body.id;
  const client = id && clients[id] && clients[id].instance ? clients[id] : null;
  if (client) logger.info("File upload from " + id);
  const fileList = request.files;

  if (fileList) {
    let str = "";
    let errorFlag = false;
    let nFiles = fileList.length;
    nFiles = fileList.length;
    fileList.forEach(
      client
        ? (file) => {
            uploadToDocker(
              client,
              file.path,
              file.originalname,
              sshCredentials,
              function (err) {
                if (err) errorFlag = true;
                else {
                  str += file.originalname + "<br/>";
                  emitViaClientSockets(client, "filechanged", {
                    fileName: file.originalname,
                    hash: request.body.hash,
                  });
                }
                nFiles--;
                if (nFiles == 0) {
                  if (errorFlag) {
                    response.writeHead(500);
                    response.write(
                      "File upload failed. Please try again later.<br/><b>" +
                        str +
                        "</b>"
                    );
                  } else {
                    response.writeHead(200);
                    response.write(
                      "The following files have been uploaded and can be used in your session:<br/><b>" +
                        str +
                        "</b>"
                    );
                  }
                  response.end();
                }
              }
            );
          }
        : (file) => unlink(file.path)
    );
  }
  if (!client) {
    response.writeHead(400);
    response.end();
  }
};

const unhandled = function (request, response) {
  logger.error("Request for something we don't serve: " + request.url);
  response.writeHead(404, "Request for something we don't serve.");
  response.write("2^2*101"); // TODO: something nicer
  response.end();
};

const initializeServer = function () {
  const favicon = require("serve-favicon");
  const serveStatic = require("serve-static");
  const serveIndex = require("serve-index");
  const expressWinston = require("express-winston");
  serveStatic.mime.define({ "text/plain": ["m2"] }); // declare m2 files as plain text for browsing purposes

  app.use(expressWinston.logger(logger));
  app.use(favicon(staticFolder + "favicon.ico"));
  app.post("/upload/", upload.array("files[]"), fileUpload);
  app.use("/usr/share/", serveStatic("/usr/share")); // optionally, serve documentation locally
  app.use("/usr/share/", serveIndex("/usr/share")); // allow browsing
  app.use(serveStatic(staticFolder));
  app.use(fileDownload);
  app.use(unhandled);
};

const clientExistenceCheck = function (clientId: string): Client {
  logger.info("Checking existence of client with id " + clientId);
  if (!clients[clientId]) {
    clients[clientId] = new Client(clientId);
  }
  return clients[clientId];
};

const sanitizeClient = function (client: Client, force?: boolean) {
  if (!client.saneState) {
    logClient(client, "Is already being sanitized");
    return false;
  }
  logClient(client, "Sanitizing");
  client.saneState = false;

  if (
    force ||
    !client.channel ||
    !client.channel.writable ||
    !client.instance
  ) {
    spawnMathProgram(client);
    client.savedOutput = "";
    client.outputStat = 0;

    // Avoid stuck sanitizer. shouldn't happen in theory...
    setTimeout(function () {
      client.saneState = true;
    }, 10000);
  } else {
    logClient(client, "Has mathProgram instance.");
    client.saneState = true;
  }
};

const writeMsgOnStream = function (client: Client, msg: string) {
  client.channel.stdin.write(msg, function (err) {
    if (err) {
      logClient(client, "write failed: " + err);
      sanitizeClient(client);
    }
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
  logClient(client, "Checking sanity: " + client.saneState);
  return client.saneState;
};

const socketInputAction = function (socket: SocketIO.Socket, client: Client) {
  return function (msg: string) {
    logClient(client, "Receiving input: " + short(msg));
    if (checkClientSane(client)) {
      //      updateLastActiveTime(client); // only output now triggers that
      checkAndWrite(client, msg);
    }
  };
};

const socketResetAction = function (client: Client) {
  return function () {
    logClient(client, "Received reset.");
    systemChat(client, "Resetting M2.");
    if (checkClientSane(client)) {
      if (client.channel) killMathProgram(client);
      sanitizeClient(client, true);
    }
  };
};

const socketRestoreAction = function (socket: SocketIO.Socket, client: Client) {
  return function () {
    logClient(client, "Restoring output");
    safeEmit(socket, "output", client.savedOutput); // send previous output
  };
};

const socketFileExists = function (socket: SocketIO.Socket, client: Client) {
  return function (fileName: string, callback) {
    downloadFromDocker(client, fileName, sshCredentials, callback);
  };
};

const initializeClientId = function (): string {
  const clientId = clientIdHelper(clients, logger.info).getNewId();
  return clientId;
};

const validateId = function (s): string {
  if (s === undefined) return undefined;
  s = s.replace(/[^a-zA-Z_0-9]/g, "");
  if (s == "") return undefined;
  else return s;
};

const httpsWorker = function (glx) {
  const server = glx.httpsServer();

  io = socketio(server, { pingTimeout: 30000 });

  io.on("connection", function (socket: SocketIO.Socket) {
    logger.info("Incoming new connection!");
    const version = socket.handshake.query.version;
    if (options.version && version != options.version) {
      safeEmit(
        socket,
        "output",
        "Client/server version mismatch. Please refresh your page."
      );
      disconnectSocket(socket);
      return; // brutal
    }
    let clientId: string = getClientId(socket);
    if (clientId === "failed") {
      logger.info("Disconnecting for failed authentication.");
      disconnectSocket(socket);
      return;
    }
    if (clientId === undefined) {
      // need new one
      clientId = initializeClientId();
    }

    const client = clientExistenceCheck(clientId);
    logClient(client, "Connected");
    addNewSocket(client, socket);
    getInstance(client, function () {
      // sanitize would do it anway but we want to emit
      safeEmit(socket, "instance", clientId);
      sanitizeClient(client);
    });
    socket.on("input", socketInputAction(socket, client));
    socket.on("reset", socketResetAction(client));
    socket.on("chat", socketChatAction(socket, client));
    socket.on("restore", socketRestoreAction(socket, client));
    socket.on("disconnect", socketDisconnectAction(socket, client));
    socket.on("fileexists", socketFileExists(socket, client));
  });

  glx.serveApp(app);
};

const listen = function () {
  greenlock
    .init({
      packageRoot: path.join(__dirname, "/../.."),
      // contact for security and critical bug notices
      maintainerEmail: "pzinn@unimelb.edu.au",
      // where to look for configuration
      configDir: "./greenlock.d",
      // whether or not to run at cloudscale
      cluster: false,
    })
    .ready(httpsWorker);

  logger.info("Http  server running on " + serverConfig.port);
  logger.info("Https server running on " + serverConfig.port2);
};

const getClientIdAuth = function (authOption: boolean) {
  if (authOption) {
    const auth = require("http-auth");
    const basic = auth.basic({
      realm: "Please enter your username and password.",
      file: path.join(__dirname, "/../../public/users.htpasswd"),
    });
    app.use(auth.connect(basic));
    return function (socket: SocketIO.Socket) {
      if (socket.handshake.query.id)
        logger.warn("Ignoring userId command line");
      try {
        return (
          "user" +
          Buffer.from(
            socket.request.headers.authorization.split(" ").pop(),
            "base64"
          )
            .toString()
            .split(":")[0]
        );
      } catch (error) {
        return "failed";
      }
    };
  } else
    return function (socket: SocketIO.Socket) {
      return validateId(socket.handshake.query.id);
    };
};

const mathServer = function (o) {
  options = o;
  serverConfig = options.serverConfig;

  if (!serverConfig.CONTAINERS) {
    logger.error("error, no container management given.");
    throw new Error("No CONTAINERS!");
  }

  getClientId = getClientIdAuth(options.authentication);
  const resources = options.perContainerResources;
  const guestInstance = options.startInstance;
  const hostConfig = options.hostConfig;
  guestInstance.port = hostConfig.instancePort;
  instanceManager = serverConfig.CONTAINERS(
    resources,
    hostConfig,
    guestInstance
  );

  instanceManager.recoverInstances(function () {
    logger.info("Start init");
    initializeServer();
    listen();
  });
};

export {
  mathServer,
  emitViaClientSockets,
  safeEmit,
  io,
  short,
  clients,
  options,
  staticFolder,
  unlink,
};
