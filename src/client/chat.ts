import { scrollDown } from "./htmlTools";
import { socket } from "./main";
import { Chat } from "../common/chatClass";

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
    if (msg.recipients) {
      const alias = (document.getElementById("chatAlias") as HTMLInputElement)
        .value;
      if (
        !msg.recipients.some(
          (name) => name.endsWith("/") || name == alias || name == "id/" + alias
        )
      )
        // we don't have the right alias
        return;
    }
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
    const test = mdtohtml(msg.message);
    s3.innerHTML = test;
    const recipients = msg.recipients
      ? " (to " +
        msg.recipients
          .filter((name) => name != msg.alias && name != "id/" + msg.alias)
          .join(", ") +
        ")"
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
    if (index === undefined && msg.alias != "System") {
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

// note the repeated use of pattern (?<!\\) which means not escaped with \
const escapeHTML = (str) =>
  str
    .replace(
      /[&<>'"]/g,
      (tag) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        }[tag])
    )
    /*      .replace(/!\[([^\]]*)]\(([^(]+)\)/g, '<img alt="$1" src="$2">') */
    .replace(
      /(?<!\\)\[([^\]]+)(?<!\\)](?<!\\)\(([^(]+?)(?<!\\)\)/g,
      "$1".link("$2")
    ) // [a link](github.com)
    .replace(/(?<!\\)`((?:[^`]|(?<=\\)`)*)(?<!\\)`/g, "<code>$1</code>") // `R=QQ[x]`
    .replace(
      /(?<!\\)(\*\*|__)(?=\S)([^\r]*?\S[*_]*)(?<!\\)\1/g,
      "<strong>$2</strong>"
    ) // **really important**
    .replace(/(?<!\\)(\*|_)(?!\s|\*|_)([^\r]*?\S)(?<!\\)\1/g, "<em>$2</em>") // *important*
    .replace(/(?<!\\)\\/g, ""); // remove escaping

const cut = (s, x) => escapeHTML(s.substring(x[0].length));
const patterns = [
  { pattern: /^\*\s/, tag: (x) => "ul", linetag: (x) => "li", proc: cut },
  { pattern: /^\d+\.\s/, tag: (x) => "ol", linetag: (x) => "li", proc: cut },
  { pattern: /^#+\s/, tag: null, linetag: (x) => "h" + x[0].length, proc: cut },
  {
    pattern: /\|/,
    tag: (x) => "table",
    linetag: (x) => "tr",
    proc: (s, x) => {
      if (s.startsWith("|")) s = s.substring(1);
      if (s.endsWith("|")) s = s.substring(0, s.length - 1);
      return (
        "<td>" +
        escapeHTML(s.replace(/(?<!\\)\|/g, "\\\\|")).replace(
          /\\\|/g,
          "</td><td>"
        ) +
        "</td>"
      );
    }, // bit of a mess
  },
];

const mdtohtml = function (src) {
  const lines = src.split(/\n|\u21B5/);
  let res = "";
  let x;
  let i,
    oldi = -1;
  lines.forEach(function (s) {
    s = s.trim();
    i = patterns.findIndex((p) => {
      x = s.match(p.pattern);
      return x !== null;
    });
    if (i != oldi) {
      if (oldi >= 0 && patterns[oldi].tag != null)
        res += "</" + patterns[oldi].tag(x) + ">";
      if (i >= 0 && patterns[i].tag != null)
        res += "<" + patterns[i].tag(x) + ">";
    }
    oldi = i;
    if (i >= 0) {
      res +=
        "<" +
        patterns[i].linetag(x) +
        ">" +
        patterns[i].proc(s, x) +
        "</" +
        patterns[i].linetag(x) +
        ">";
    } else res += escapeHTML(s) + "<br/>";
  });
  if (i >= 0 && patterns[i].tag != null) res += "</" + patterns[i].tag(x) + ">";
  return res;
};

export { socketChat };
