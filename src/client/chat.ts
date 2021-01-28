import { scrollDown } from "./htmlTools";
import { socket } from "./main";
import { Chat } from "../common/chatClass";
import { autoRender } from "./autoRender";
import { mdToHTML } from "./md";

const deleteChat = function (h) {
  const el = document.getElementById("message-" + h);
  if (el) {
    el.remove();
    return true;
  } else return false;
};

const deleteChatWrap = function (h) {
  return function (e) {
    e.stopPropagation();
    if (deleteChat(h)) {
      // send back to server in case message is ours
      socket.emit("chat", {
        type: "delete",
        alias: (document.getElementById("chatAlias") as HTMLInputElement).value,
        hash: h,
        time: new Date().toISOString().replace("T", " ").substr(0, 19),
      });
    }
  };
};

const chatAction = function (msg: Chat, index?) {
  if (msg.type == "delete") {
    deleteChat(msg.hash);
  } else if (msg.type == "message") {
    if (
      msg.recipients !== null && // null is wild card
      msg.recipients.indexOf(
        (document.getElementById("chatAlias") as HTMLInputElement).value
      ) < 0
    )
      // we don't have the right alias
      return;
    const ul = document.getElementById("chatMessages");
    const msgel = document.createElement("li");
    msgel.classList.add("chatMessage");
    msgel.id = "message-" + msg.hash;
    const s0 = document.createElement("i");
    s0.className = "material-icons message-close";
    s0.textContent = "close";
    s0.onclick = deleteChatWrap(msg.hash);
    const s1 = document.createElement("i");
    s1.textContent = msg.time;
    const s2 = document.createElement("b");
    s2.textContent = msg.alias;
    s2.className = msg.type + "-" + msg.alias;
    const s3 = document.createElement("span");
    //  s3.textContent = msg.message;
    s3.innerHTML = mdToHTML(msg.message, "br", null);
    autoRender(s3);
    const recipients = msg.recipientsSummary
      ? " (to " + msg.recipientsSummary + ")"
      : "";
    msgel.append(
      s0,
      s1,
      " : ",
      s2,
      recipients,
      document.createElement("br"),
      s3
    );
    ul.appendChild(msgel);
    scrollDown(ul);
    if (index === undefined) {
      // not if restoring
      const chatTitle = document.getElementById("chatTitle");
      if (document.location.hash != "#chat") {
        chatTitle.classList.add(msg.type + "-" + msg.alias);
      }
      chatTitle.classList.add("message-pop");
      setTimeout(function () {
        chatTitle.classList.remove("message-pop");
      }, 500);
    }
  }
};

const socketChat = function (msg) {
  // msg = array or single message
  if (Array.isArray(msg)) msg.forEach(chatAction);
  else chatAction(msg);
};

export { socketChat };
