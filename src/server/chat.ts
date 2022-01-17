import { Client } from "./client";
import { Socket } from "socket.io";
import { Chat } from "../common/chatClass";
import {
  emitViaClientSockets,
  safeEmit,
  io,
  short,
  clients,
  options,
  instanceManager,
} from "./server";
import { logger } from "./logger";
import { execInInstance } from "./exec";
import { decode, encode } from "html-entities";

const chatList: Chat[] = []; // used to restore chat
const chatBlackList: string[] = [];
let chatBlock = false;
let chatCounter = 0;

const systemChat = function (client: Client | null, msg: string) {
  const chat: Chat = {
    message: msg,
    alias: "System",
    type: "message",
    time: Date.now(),
    index: chatCounter++,
  };
  if (client) emitViaClientSockets(client, "chat", chat);
  else safeEmit(io, "chat", chat);
};

const socketChatAction = function (socket: Socket, client: Client) {
  const chatRestore = function (chat0: Chat) {
    safeEmit(
      socket,
      "chat",
      chatList.map(function (chat: Chat) {
        if (
          chat.index <= chat0.index ||
          (chat.recipients[client.id] === undefined &&
            chat.recipients[""] === undefined)
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
    if (chat0.index < 0)
      systemChat(
        client,
        "Welcome " + chat0.alias + " (id " + client.id + ") !"
      ); // welcome only if first time
  };
  const chatMessage = function (chat: Chat) {
    logger.info(chat.alias + " said: " + short(chat.message), client);
    chat.index = chatCounter++;
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
      if (id1 == "") safeEmit(io, "chat", chat1);
      // broadcast
      else {
        const client1 = clients[id1];
        if (client1) emitViaClientSockets(client1, "chat", chat1);
      }
    }
    chat.id = client.id;
  };
  const chatDelete = function (chat: Chat, i: number) {
    logger.info(chat.alias + " deleted #" + chat.index, client);
    chatList.splice(i, 1);
    safeEmit(io, "chat", chat);
  };
  const chatRun = function (chat: Chat) {
    execInInstance(
      client,
      decode(chat.message.replace("<br>", "\n")).substring(1),
      function (out) {
        chat.recipients = null;
        chat.index = chatCounter++;
        chat.message =
          "```sh\n" +
          chat.message.substring(1) +
          "\n```\n```sh\n" +
          encode(out) +
          "```";
        safeEmit(socket, "chat", chat);
      }
    );
  };
  const chatAdmin = function (chat: Chat) {
    chat.recipients = null;
    if (chat.message.startsWith("/killall")) {
      for (const id in clients) {
        if (id != options.adminName) instanceManager.removeInstanceFromId(id);
      }
    } else if (chat.message.startsWith("/kill")) {
      const i = chat.message.indexOf(" ");
      if (i > 0) {
        chat.message
          .substring(i + 1)
          .split(" ")
          .forEach((id) => instanceManager.removeInstanceFromId(id));
      } else {
        instanceManager.removeInstanceFromId(client.id); // self-kill
        logger.info("Killing instance", client);
        systemChat(client, "Instance killed. Press Reset to start a new one.");
      }
    } else if (chat.message.startsWith("/block")) {
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
    } else if (chat.message.startsWith("/stop")) {
      systemChat(null, "The server is stopping.");
      setTimeout(function () {
        logger.info("Exiting");
        process.exit(0);
      }, 5000);
    } else {
      // default: (short) list
      let clientsList = Object.values(clients).sort(function (a, b) {
        const timea = a.instance ? a.instance.lastActiveTime : 0;
        const timeb = b.instance ? b.instance.lastActiveTime : 0;
        return timea - timeb;
      });
      if (!chat.message.startsWith("/list"))
        clientsList = clientsList.filter(
          (client) => client.instance && client.sockets.length > 0
        );
      chat.message +=
        "\n | id | sockets | output | last | docker | inputs | active time " +
        clientsList
          .map(
            (client) =>
              "\n|" +
              client.id +
              "|" +
              client.sockets
                .map((x) => x.handshake.address)
                .sort()
                .filter((v, i, o) => v !== o[i - 1])
                .join("\\n") +
              "|" +
              client.savedOutput.length +
              "|\t" +
              client.savedOutput
                .substring(client.savedOutput.length - 48)
                .replace(/[^ -z{}]/g, " ") +
              "\t|" +
              (client.instance
                ? client.instance.containerName +
                  "|" +
                  client.instance.numInputs +
                  "|" +
                  new Date(client.instance.lastActiveTime)
                    .toISOString()
                    .replace("T", " ")
                    .substr(0, 19)
                : "")
          )
          .join("");
    }
    chat.index = chatCounter++;
    safeEmit(socket, "chat", chat);
  };

  return client.id != options.adminName
    ? function (chat: Chat) {
        // normal user
        logger.info("Chat of type " + chat.type, client);
        if (
          chat.alias == options.adminAlias ||
          chat.alias == options.systemAlias
        ) {
          logger.warn("tried to impersonate Admin or System", client);
          chat.alias = options.defaultAlias;
        }
        if (
          chatBlock ||
          chatBlackList.indexOf(client.id) >= 0 ||
          chatBlackList.indexOf(socket.handshake.address) >= 0
        )
          return; // blocked
        if (chat.type == "delete") {
          const i = chatList.findIndex((x) => x.index === chat.index); // sigh
          if (
            i < 0 ||
            chatList[i].id != client.id ||
            chatList[i].alias != chat.alias
          )
            return; // false alarm
          chatDelete(chat, i);
        } else if (chat.type === "restore") chatRestore(chat);
        else if (chat.type === "message") {
          if (chat.message[0] == "!") chatRun(chat);
          else if (chat.message.startsWith("/kill")) {
            instanceManager.removeInstanceFromId(client.id); // can only self-kill
            logger.info("Killing instance", client);
            systemChat(
              client,
              "Instance killed. Press Reset to start a new one."
            );
          } else chatMessage(chat);
        }
      }
    : function (chat: Chat) {
        // admin
        logger.info("Chat of type " + chat.type, client);
        if (chat.type == "delete") {
          const i = chatList.findIndex((x) => x.index === chat.index); // sigh
          if (i < 0) return; // false alarm
          chatDelete(chat, i);
        } else if (chat.type === "restore") chatRestore(chat);
        else if (chat.type === "message") {
          if (chat.message[0] == "/") chatAdmin(chat);
          else if (chat.message[0] == "!") chatRun(chat);
          else chatMessage(chat);
        }
      };
};

export { systemChat, socketChatAction };
