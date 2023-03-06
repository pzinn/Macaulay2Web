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
  const admin = client.id == options.adminName;
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
  const chatRun = function (chat: Chat, runCmd: string) {
    execInInstance(client, decode(runCmd), function (out) {
      const msg = "```sh\n" + runCmd + "\n```\n```sh\n" + encode(out) + "```";
      chat.recipients = null; // won't be recorded
      chat.index = chatCounter++;
      chat.message = msg;
      "```sh\n" + runCmd + "\n```\n```sh\n" + encode(out) + "```";
      safeEmit(socket, "chat", chat); // only sent to sender
    });
  };
  const chatListUsers = function (chat: Chat, activeonly?: boolean) {
    let clientsList = Object.values(clients).sort(function (a, b) {
      const timea = a.instance ? a.instance.lastActiveTime : 0;
      const timeb = b.instance ? b.instance.lastActiveTime : 0;
      return timea - timeb;
    });
    if (!admin)
      // non admin only see their own id
      clientsList = clientsList.filter((client1) => client1.id == client.id);
    else if (activeonly)
      // short list
      clientsList = clientsList.filter(
        (client1) => client1.instance && client1.sockets.length > 0
      );

    chat.message =
      "| id | sockets | output | last | docker | inputs | active time " +
      clientsList
        .map(
          (client) =>
            "\n|" +
            client.id +
            "|" +
            client.sockets
              .map((x) => x.handshake.address)
              .sort()
              //              .filter((v, i, o) => v !== o[i - 1]) // this suppresses repeats...
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
  };
  const chatSlash = function (chat: Chat) {
    chat.alias = decode(
      chat.message.replace("<br>", "\n").replace(/<[^>]*>?/gm, "")
    ); // ! a form of echo. primitive html stripping
    chat.message = "";
    chat.recipients = null; // message not destined to be broadcast or recorded
    chat.index = chatCounter++; // it still has its number for client purposes
    const ind = chat.alias.indexOf(" ");
    let cmd = ind < 0 ? chat.alias.substring(1) : chat.alias.substring(1, ind);
    if (cmd == "") cmd = "help";
    const args = ind < 0 ? "" : chat.alias.substring(ind + 1);
    if ("stop".startsWith(cmd) && admin) {
      if (cmd == "stop") {
        systemChat(null, "The server is stopping.");
        setTimeout(function () {
          logger.info("Exiting");
          process.exit(0);
        }, 5000);
      } else chat.message = "Please type 'stop' in full";
    } else if ("block".startsWith(cmd) && admin) {
      if (ind < 0) {
        // toggle full block
        chatBlock = !chatBlock;
        chat.message = " (" + chatBlock + ")";
      } else
        args.split(" ").forEach((name) => {
          const i = chatBlackList.indexOf(name);
          if (i < 0) {
            chatBlackList.push(name);
            chat.message += name + " (true) ";
          } else {
            chatBlackList.splice(i, 1);
            chat.message += name + " (false) ";
          }
        });
    } else if ("list".startsWith(cmd)) chatListUsers(chat, args == "short");
    else if (cmd != "run" && cmd != "kill") {
      chat.message = "List of / commands:<ul>";
      if (admin)
        chat.message +=
          "<li><b>/list [short]</b> – list all users</li><li><b>/run [command]</b> – run a linux command</li><li><b>/kill [id]</b> – kill your (or someone else's) Macaulay2 session and container</li><li><b>/block [id,ip]</b> – block all or some users from chat</li><li><b>/stop</b> – stop the server";
      else
        chat.message +=
          "<li><b>/list</b> – list all users with your id</li><li><b>/run [command]</b> – run a linux command</li><li><b>/kill</b> – kill your Macaulay2 session and container</li>";
      chat.message += "</ul>";
    }
    if ("run".startsWith(cmd)) chatRun(chat, args);
    else safeEmit(socket, "chat", chat); // only sent to sender. "run" has delayed output
    if ("kill".startsWith(cmd)) {
      if (ind > 0 && admin) {
        // kill others
        if (args == "all")
          for (const id in clients) {
            if (id != options.adminName)
              instanceManager.removeInstanceFromId(id);
          }
        else
          args
            .split(" ")
            .forEach((id) => instanceManager.removeInstanceFromId(id));
      } else {
        logger.info("Killing instance", client);
        instanceManager.removeInstanceFromId(client.id); // self-kill
        systemChat(client, "Instance killed. Press Reset to start a new one."); // sent to all users with that id, not just sender
      }
    }
  };

  return function (chat: Chat) {
    logger.info("Chat of type " + chat.type, client);
    if (
      !admin &&
      (chat.alias == options.adminAlias || chat.alias == options.systemAlias)
    ) {
      logger.warn("tried to impersonate Admin or System", client);
      chat.alias = options.defaultAlias;
    }
    if (
      !admin &&
      (chatBlock ||
        chatBlackList.indexOf(client.id) >= 0 ||
        chatBlackList.indexOf(socket.handshake.address) >= 0)
    )
      return; // blocked
    if (chat.type == "delete") {
      const i = chatList.findIndex((x) => x.index === chat.index); // sigh
      if (
        i < 0 ||
        (!admin && // only admin gets to delete others' messages
          (chatList[i].id != client.id || chatList[i].alias != chat.alias))
      )
        return; // false alarm
      chatDelete(chat, i);
    } else if (chat.type === "restore") chatRestore(chat);
    else if (chat.type === "message") {
      if (chat.message[0] == "/") chatSlash(chat);
      else chatMessage(chat);
    }
  };
};

export { systemChat, socketChatAction };
