import { scrollDown } from "./htmlTools";

const deleteChat = function (h) {
  return function (e) {
    e.stopPropagation();
    document.getElementById("message-" + h).remove();
  };
  // should somehow send back info to server only if admin or one's own message?
};

const showChat = function (msg, index?) {
  const ul = document.getElementById("chatMessages");
  const msgel = document.createElement("li");
  msgel.classList.add("chatMessage");
  msgel.id = "message-" + msg.hash;
  const s0 = document.createElement("i");
  s0.className = "material-icons message-close";
  s0.textContent = "close";
  s0.onclick = deleteChat(msg.hash);
  const s1 = document.createElement("i");
  s1.textContent = msg.time;
  const s2 = document.createElement("b");
  s2.textContent = msg.alias;
  s2.className = msg.type;
  const s3 = document.createElement("span");
  //  s3.textContent = msg.message;
  const test = mdtohtml(msg.message);
  s3.innerHTML = test;
  msgel.append(s0, s1, " : ", s2, document.createElement("br"), s3);
  ul.appendChild(msgel);
  scrollDown(ul);
  if (index === undefined && msg.type != "message-system") {
    const chatTitle = document.getElementById("chatTitle");
    if (document.location.hash != "#chat") {
      chatTitle.classList.add(msg.type);
    }
    chatTitle.classList.add("message-pop");
    setTimeout(function () {
      chatTitle.classList.remove("message-pop");
    }, 500);
  }
};

// TODO: intermediate function that dispatches depending on msg.type (delete, show...)

const socketChat = function (msg) {
  // msg = array or single message
  if (Array.isArray(msg)) msg.forEach(showChat);
  else showChat(msg);
};

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
    .replace(/\[([^\]]+)]\(([^(]+?)\)/g, "$1".link("$2"))
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/(\*\*|__)(?=\S)([^\r]*?\S[*_]*)\1/g, "<strong>$2</strong>")
    .replace(/(\*|_)(?=\S)([^\r]*?\S)\1/g, "<em>$2</em>");

const mdtohtml = function (src) {
  const lines = src.split("|");
  let res = "";
  let ul = false,
    ol = false,
    title,
    ul2,
    ol2;
  lines.forEach(function (s) {
    s = s.trim();
    ul2 = s.startsWith("* ");
    ol2 = s.match(/^\d+\.\s/);
    if (ul && !ul2) res += "</ul>";
    else if (ul2 && !ul) res += "<ul>";
    if (ol && !ol2) res += "</ol>";
    else if (ol2 && !ol) res += "<ol>";
    ul = ul2;
    ol = ol2 !== null;
    title = s.match(/^#+\s/);
    if (ul || ol) res += "<li>";
    else if (title) res += "<h" + title[0].length + ">";
    if (ul) s = s.substring(2);
    else if (ol) s = s.substring(ol2[0].length);
    else if (title) s = s.substring(title[0].length);
    res += escapeHTML(s);
    res += ul || ol ? "</li>" : title ? "</h" + title[0].length + ">" : "<br/>";
  });
  if (ul) res += "</ul>";
  else if (ol) res += "</ol>";
  return res;
};

module.exports = socketChat;
