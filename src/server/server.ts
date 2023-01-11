"use strict;";

import { Client, IClients, getNewId } from "./client";
import { socketChatAction, systemChat } from "./chat";
import { Instance, InstanceManager } from "./instance";
import { AddressInfo } from "net";
import { downloadFromInstance } from "./fileDownload";
import { uploadToInstance } from "./fileUpload";
import { webAppTags } from "../common/tags";
import { logger } from "./logger";
import { Socket, Server } from "socket.io";

import Cookie = require("cookie");

import express = require("express");
const app = express();
import httpModule = require("http");
const http = httpModule.createServer(app);
import fs = require("fs");
import multer = require("multer");
const upload = multer({
  dest: "/tmp/",
  preservePath: true,
  limits: { fieldSize: 1000, fields: 10, fileSize: 1024 * 1024, files: 100 },
});
import ssh2 = require("ssh2");

//import socketio = require("socket.io");
const io = new Server(http, { pingTimeout: 30000 });

import path = require("path");
let getClientId;
let serverConfig;
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

const disconnectSocket = function (socket: Socket): void {
  try {
    socket.disconnect();
  } catch (error) {
    logger.error("Failed to disconnect socket: " + error);
  }
};

const deleteClientData = function (client: Client): void {
  try {
    logger.info("Sending disconnect", client);
    clients[client.id].sockets.forEach(disconnectSocket);
  } catch (error) {
    logger.error("Socket seems already dead: " + error, client);
  }
  delete clients[client.id];
};

const safeEmit = function (target: Socket | Server, type: string, data): void {
  try {
    target.emit(type, data);
  } catch (error) {
    logger.error("Error while executing SocketIO emit of type " + type);
  }
};

const emitViaClientSockets = function (client: Client, type: string, data) {
  const s = short(data.toString());
  logger.info("Sending " + type + ": " + s, client);
  client.sockets.forEach((socket) => safeEmit(socket, type, data));
};

const getInstance = function (client: Client, next): void {
  if (client.instance) {
    instanceManager.checkInstance(client.instance, function (error) {
      if (error) {
        systemChat(
          client,
          "A new version of Macaulay2 is available. Type /kill in chat to upgrade."
        );
      }
    });
    next();
  } else {
    try {
      logger.info("No instance", client);
      client.channel = null; // investigate why closing the connection (which happens when channel ends) doesn't actually do anything
      instanceManager.getNewInstance(client.id, function (instance: Instance) {
        client.instance = instance;
        client.instance.killNotify = killNotify(client); // what is this for???
        getInstance(client, next);
      });
    } catch (error) {
      logger.error(
        "Could not get new instance. Should not drop in here",
        client
      );
    }
  }
};

const killNotify = function (client: Client) {
  return function () {
    logger.info("getting killed", client);
    deleteClientData(client);
  };
};

const constructM2Command = function (): string {
  return (
    Object.values(serverConfig.m2Prefixes).join("") +
    " M2MODE=" +
    serverConfig.mode +
    " " +
    serverConfig.m2Command
  );
};

const spawnMathProgram = function (client: Client, next) {
  logger.info("Spawning new MathProgram process", client);
  const connection: ssh2.Client = new ssh2.Client();
  connection.on("error", function (err) {
    logger.error(
      "Error when connecting. " + err + "; Retrying with new instance",
      client
    );
    connection.end(); // we don't want more errors produced
    next(false);
  });
  connection
    .on("ready", function () {
      connection.exec(
        constructM2Command(),
        { pty: { term: "dumb" } },
        function (err, channel: ssh2.ClientChannel) {
          if (err) {
            logger.error(
              "Error when executing M2. " +
                err +
                "; Retrying with new instance",
              client
            );
            return next(false);
          }
          channel.on("close", function () {
            connection.end();
          });
          channel.on("end", function () {
            channel.close();
            logger.info(
              "Channel to Math program ended, closing connection",
              client
            );
            connection.end();
          });
          attachChannelToClient(client, channel);
          next(true);
        }
      );
    })
    .connect(sshCredentials(client.instance));
};

const addNewSocket = function (client: Client, socket: Socket) {
  logger.info("Adding new socket", client);
  client.sockets.push(socket);
};

const socketDisconnectAction = function (socket: Socket, client: Client) {
  return function () {
    logger.info("Removing socket", client);
    const index = client.sockets.indexOf(socket);
    if (index >= 0) client.sockets.splice(index, 1);
  };
};

const socketErrorAction = function (client: Client) {
  return function (error) {
    logger.error("Socket error: " + error, client);
    // then what???
  };
};

const vdots = " " + webAppTags.Error + "\u22EE" + webAppTags.ErrorEnd + "\n";

const sendDataToClient = function (client: Client) {
  return function (dataObject) {
    if (client.outputStat < 0) return; // output rate exceeded
    if (!client.instance) {
      logger.warn("No instance for client", client);
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
      killMathProgram(client);
      systemChat(client, "Output rate exceeded. Killing M2.");
      logger.warn("Output rate exceeded", client);
      client.outputStat = -1; // signal to avoid repeat message
      return;
    }
    client.savedOutput += data;
    // extra logging for *users* only
    if (client.id !== "public") {
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
          vdots +
          client.savedOutput.substring(m.index + m[0].length);
      }
    } else {
      const i = client.savedOutput.lastIndexOf(webAppTags.Cell);
      client.savedOutput =
        i < 0 ||
        client.savedOutput.length - (vdots.length + i) >
          options.perContainerResources.maxSavedOutput
          ? vdots
          : vdots + client.savedOutput.substring(i);
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
};

const killMathProgram = function (client: Client) {
  logger.info("kill MathProgram", client);
  client.channel.close();
  client.channel = null; // TEMP. investigate why closing the connection (which happens when channel ends) doesn't actually do anything
};

const fileDownload = function (request, response, next) {
  // try to find user's id
  let id = request.query.user;
  if (!id) {
    const rawCookies = request.headers.cookie;
    if (!rawCookies) return next();
    const cookies = Cookie.parse(rawCookies);
    id = cookies[options.cookieName];
    if (!id) return next();
  }
  const client = clients[id];
  if (!client) return next();
  logger.info("File request", { id: id });
  const sourcePath = decodeURIComponent(request.path);
  downloadFromInstance(client, sourcePath, function (targetPath) {
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
  const fileList = request.files;
  if (!fileList) return;
  if (request.body.tutorial) {
    if (fileList.length == 0) return;
    const file = fileList[0];
    logger.info("Tutorial upload " + file.originalname);
    // move to tutorial directory
    fs.copyFile(
      file.path,
      staticFolder + "tutorials/" + file.originalname,
      (err) => {
        if (!request.body.noreply)
          if (err) {
            response.writeHead(500);
            response.write("File upload failed. Please try again later.");
          } else {
            response.writeHead(200);
          }
        response.end();
        unlink(file.path);
      }
    );
    return;
  }

  const id = request.body.id;
  const client = id && clients[id] && clients[id].instance ? clients[id] : null;
  if (client) logger.info("File upload", client);

  let str = "";
  let errorFlag = false;
  let nFiles = fileList.length;
  nFiles = fileList.length;
  fileList.forEach(
    client
      ? (file) => {
          uploadToInstance(
            client,
            file.path,
            file.originalname,
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
                if (!request.body.noreply)
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
  const serveStatic = require("serve-static"); // or could use the equivalent express.static
  const serveIndex = require("serve-index");
  const expressWinston = require("express-winston");
  serveStatic.mime.define({ "text/plain": ["m2"] }); // declare m2 files as plain text for browsing purposes

  app.use(expressWinston.logger(logger));
  app.use(favicon(staticFolder + "favicon.ico"));
  app.post("/upload/", upload.array("files[]"), fileUpload);
  app.use("/usr/share/", serveStatic("/usr/share"), serveIndex("/usr/share")); // optionally, serve documentation locally and allow browsing
  app.use(serveStatic(staticFolder, { dotfiles: "allow" }));
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

const sanitizeClient = function (client: Client, next?) {
  if (!client.saneState) {
    logger.warn("Is already being sanitized", client);
    if (next) next(false);
    return;
  }
  logger.info("Sanitizing", client);
  client.saneState = false;
  // Avoid stuck sanitizer. shouldn't happen in theory...
  setTimeout(function () {
    client.saneState = true;
  }, 30000); // 30 secs
  // first check for instance (i.e. docker)
  getInstance(client, function () {
    // then for channel to M2
    if (!client.channel || !client.channel.writable) {
      spawnMathProgram(client, function (success: boolean) {
        if (success) {
          //          emitViaClientSockets(client, "output", webAppTags.CellEnd + "\n"); // to make it look nicer
          client.savedOutput = "";
          client.outputStat = 0;
          client.saneState = true;
          if (next) next(true);
        } else {
          // start over
          try {
            delete client.instance;
            setTimeout(function () {
              client.saneState = true;
              sanitizeClient(client, next);
            }, 3000); // 3 sec
          } catch (instanceDeleteError) {
            logger.error(
              "Error when deleting instance: " + instanceDeleteError,
              client
            );
            deleteClientData(client);
          }
        }
      });
    } else {
      logger.info("Has mathProgram instance", client);
      client.saneState = true;
      if (next) next(true);
    }
  });
};

const writeMsgOnStream = function (client: Client, msg: string) {
  client.channel.stdin.write(msg, function (err) {
    if (err) {
      logger.error("write failed: " + err, client);
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
  if (!client.instance || !client.channel || !client.channel.writable) {
    sanitizeClient(client);
  } else {
    client.instance.numInputs++;
    writeMsgOnStream(client, msg);
  }
};

const socketInputAction = function (socket: Socket, client: Client) {
  return function (msg: string) {
    logger.info("Receiving input: " + short(msg), client);
    //      updateLastActiveTime(client); // only output now triggers that
    if (client.saneState) checkAndWrite(client, msg);
    else logger.warn("Input failed, client being sanitized", client);
  };
};

const socketResetAction = function (client: Client) {
  return function () {
    logger.info("Received reset", client);
    systemChat(client, "Resetting M2.");
    if (client.saneState) {
      if (client.channel) killMathProgram(client);
      sanitizeClient(client);
    } else logger.warn("Reset failed, client being sanitized", client);
  };
};

const socketRestoreAction = function (socket: Socket, client: Client) {
  return function () {
    logger.info("Restoring output", client);
    safeEmit(socket, "output", client.savedOutput); // send previous output
  };
};

const socketFileExists = function (socket: Socket, client: Client) {
  return function (fileName: string, callback) {
    downloadFromInstance(client, fileName, callback);
  };
};

const validateId = function (s): string {
  if (s === undefined) return undefined;
  s = s.replace(/\W/g, "");
  return s == "" ? undefined : s;
};

const listen = function () {
  io.on("connection", function (socket: Socket) {
    logger.info("Incoming new connection");
    const version = socket.handshake.query.version;
    if (options.version && version != options.version) {
      safeEmit(
        socket,
        "output",
        "Client/server version mismatch. Please refresh your page.\n"
      );
      disconnectSocket(socket);
      return; // brutal
    }
    let clientId: string = getClientId(socket);
    if (clientId === "failed") {
      logger.info("Disconnecting for failed authentication");
      disconnectSocket(socket);
      return;
    }
    if (clientId === undefined) {
      // need new one
      clientId = getNewId(clients);
    }

    const client = clientExistenceCheck(clientId);
    logger.info("Connected", client);
    addNewSocket(client, socket);
    sanitizeClient(client, function () {
      safeEmit(socket, "instance", clientId);
    });
    socket.on("input", socketInputAction(socket, client));
    socket.on("reset", socketResetAction(client));
    socket.on("chat", socketChatAction(socket, client));
    socket.on("restore", socketRestoreAction(socket, client));
    socket.on("disconnect", socketDisconnectAction(socket, client));
    socket.on("error", socketErrorAction(client));
    socket.on("fileexists", socketFileExists(socket, client));
  });

  const listener = http.listen(serverConfig.port);
  logger.info("Server running on " + (listener.address() as AddressInfo).port);
  return listener;
};

const getClientIdAuth = function (authOption: boolean) {
  if (authOption) {
    const auth = require("http-auth");
    const basic = auth.basic({
      realm: "Please enter your username and password.",
      file: path.join(__dirname, "/../../public/users.htpasswd"),
    });
    app.use(auth.connect(basic));
    return function (socket: Socket) {
      if (socket.handshake.query.id)
        logger.warn("Ignoring userId command line");
      try {
        return Buffer.from(
          socket.request.headers.authorization.split(" ").pop(),
          "base64"
        )
          .toString()
          .split(":")[0];
      } catch (error) {
        return "failed";
      }
    };
  } else
    return function (socket: Socket) {
      return validateId(socket.handshake.query.id);
    };
};

const mathServer = function (o) {
  options = o;
  serverConfig = options.serverConfig;

  if (!options.manager) {
    logger.error("error, no container management given");
    throw new Error("No CONTAINERS!");
  }

  getClientId = getClientIdAuth(options.authentication);
  const resources = options.perContainerResources;
  const hostConfig = options.hostConfig;
  const guestInstance = options.startInstance;
  instanceManager = new options.manager(resources, hostConfig, guestInstance);

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
  sshCredentials,
  instanceManager,
};
