/* eslint-env browser */
"use strict";
declare const MINIMAL;

import { Socket as Socket0, io } from "socket.io-client";

import { extra1, extra2, getCookieId, setCookieId } from "./extra";
import { syncChat } from "./chat";

type Socket = Socket0 & { oldEmit?: any };

export { Socket };
let socket: Socket;
import { Shell } from "./terminal";

import {
  barKey,
  hideContextMenu,
  barMouseDown,
  barRightClick,
  unselectCells,
} from "./bar";

import { options } from "../common/global";

import { language } from "./htmlTools";

let myshell = null; // the terminal
let clientId = MINIMAL ? "public" : getCookieId(); // client's id. it's public / in the cookie,
// but can be overwritten by url or chosen by server if no cookie
let initDone = false;

const keydownAction = function (e) {
  if (e.key == "F1") {
    e.preventDefault();
    e.stopPropagation();
    //    const sel = window.getSelection().toString();
    const sel = e.currentTarget.ownerDocument.getSelection().toString().trim(); // works in iframe too
    if (sel == "") return;
    socket.emit("input", 'viewHelp "' + sel + '"\n');
  } else if (e.target.classList.contains("M2CellBar"))
    barKey(e, e.target.parentElement);
  else if (e.key == "Enter" && e.shiftKey)
    // shift-Enter works on selection even outside editor
    myshell.postMessage(
      e.currentTarget.ownerDocument.getSelection().toString(),
      false,
      false
    );
};

const socketDisconnect = function (msg) {
  console.log("We got disconnected. " + msg);
};

const socketError = function (error) {
  console.log("Socket error. " + error);
};

const emitStack = [];

const wrapEmitForDisconnect = function (event, msg, callback?) {
  if (socket.disconnected || !initDone) {
    //     console.log("We are disconnected/not init. " + event);
    const events = ["reset", "input", "chat", "fileexists"]; // !!!
    if (events.indexOf(event) >= 0) {
      emitStack.push([event, msg, callback]);
      socket.connect();
    }
  } else {
    //     console.log("We are connected. " + event);
    socket.oldEmit(event, msg, callback);
  }
  return socket;
};

const fixAnchor = function (t: HTMLAnchorElement) {
  const url = t.href;
  if (!t.target && t.hash == "") {
    if (MINIMAL || (t.host && t.host != window.location.host))
      t.target = "_blank";
    else t.target = "browse";
  } // external links in new tab, internal in frame (except # which should stay default)
  if (url.startsWith("file://")) t.href = url.substring(7); // no local files
};

const clickAction = function (e) {
  if (e.button != 0) return;
  hideContextMenu();
  let t = e.target as HTMLElement;
  while (t && t != e.currentTarget) {
    if (t.classList.contains("M2CellBar")) {
      e.stopPropagation();
      // bar stuff is handled my mousedown, not click (needed for shift-click)
      return;
    }
    if (
      ((t.tagName == "CODE" && language(t) == "Macaulay2") ||
        t.dataset.m2code || // allows to emulate code pasting from arbitrary html element
        t.classList.contains("M2PastInput")) &&
      t.ownerDocument.getSelection().isCollapsed
    ) {
      e.stopPropagation();
      myshell.codeInputAction(t);
      break;
    } else if (t.tagName == "A") {
      fixAnchor(t as HTMLAnchorElement);
      break;
    }
    t = t.parentElement;
  }
  if (e.target.classList.contains("examples")) {
    // bit of a hack: examples table ~ bar
    const a = Array.from(
      e.target.getElementsByClassName("M2Cell")
    ) as HTMLElement[];
    if (a.length > 0) {
      a.forEach((el) => el.classList.add("M2CellSelected"));
      (a[0].firstElementChild as HTMLElement).focus({ preventScroll: true });
    }
  } else unselectCells(e.currentTarget.ownerDocument);
};

const mousedownAction = function (e) {
  if (e.button != 0) return;
  if (e.target.classList.contains("M2CellBar")) barMouseDown(e);
};

const rightclickAction = function (e) {
  if (e.target.classList.contains("M2CellBar") && !e.shiftKey) barRightClick(e);
};

let socketOutput;
if (MINIMAL) {
  socketOutput = function (msg: string) {
    myshell.displayOutput(msg);
  };
} else {
  let title;
  let titleTimeout;
  const animateTitle = function () {
    document.title = document.title == title ? "New Macaulay2 output" : title;
    titleTimeout = setTimeout(animateTitle, 500);
  };
  socketOutput = function (msg: string) {
    if (
      !(
        document.hasFocus() ||
        (
          document.getElementById("browseFrame") as HTMLFrameElement
        ).contentDocument.hasFocus() ||
        titleTimeout
      )
    ) {
      window.onfocus = function () {
        clearTimeout(titleTimeout);
        window.onfocus = null;
        document.title = title;
      };
      title = document.title;
      animateTitle();
    }
    myshell.displayOutput(msg);
  };
}

const url = new URL(document.location.href);

const init = function () {
  if (!MINIMAL && !navigator.cookieEnabled) {
    alert("This site requires cookies to be enabled.");
    return;
  }

  console.log("Macaulay2Web version " + options.version);

  if (!MINIMAL) extra1();

  const userId: any = url.searchParams.get("user");
  const newId = userId ? userId : "";
  if (userId && clientId !== newId) {
    if (MINIMAL) clientId = newId;
    else {
      const dialog = document.getElementById("changeUserDialog"); // not a dialog
      document.getElementById("newUserId").textContent = userId;
      document.getElementById("oldUserIdReminder").innerHTML = clientId
        ? "Choosing `permanent' will overwrite the current id <b>" +
          clientId +
          "</b> in your cookie."
        : "";
      dialog.style.display = "block";
      dialog.onclick = function (e) {
        const el = e.target as HTMLElement;
        if (el.tagName === "BUTTON") {
          // eww
          clientId = newId;
          if (el.textContent == "permanent") setCookieId();
          dialog.style.display = "none";
          init2();
        }
      };
      //      dialog.showModal();
      return;
    }
  } else if (!MINIMAL) {
    if (clientId) setCookieId();
    // reset the cookie clock
    else {
      // set up start button
      const resetBtn = document.getElementById("resetBtn");
      const resetBtn1 = document.getElementById("resetBtn1");
      const resetBtn2 = document.getElementById("resetBtn2");
      resetBtn1.textContent = "Start";
      resetBtn2.innerHTML = "<i class='material-icons'>not_started</i>";
      resetBtn.classList.add("startButton");
      setTimeout(function () {
        // slight delay for robots
        resetBtn.onclick = function (e) {
          e.stopPropagation();
          resetBtn1.textContent = "Reset";
          resetBtn2.innerHTML = "<i class='material-icons'>replay</i>";
          resetBtn.classList.remove("startButton");
          clientId = getCookieId(); // in the unlikely event that it got changed while we were waiting
          init2();
        };
      }, 300);
      return;
    }
  }
  init2();
};

const init2 = function () {
  if (!MINIMAL)
    document.getElementById("terminalDiv").style.display = "initial";
  let ioParams = "?version=" + options.version;
  if (clientId) ioParams += "&id=" + clientId;
  socket = io(ioParams, { autoConnect: false });

  socket.on("instance", function (id) {
    console.log("Instance with id " + id);
    if (id != clientId) {
      // new id was generated
      clientId = id;
      if (!MINIMAL) setCookieId();
    }
    if (!initDone) {
      // first time we get our id, finish init
      initDone = true;
      socket.emit("restore"); // restore former M2 output
      if (!MINIMAL) extra2();
      for (const e of emitStack) socket.oldEmit(e[0], e[1], e[2]); // not emit to avoid potential infinite loop
      emitStack.length = 0;
      const exec = url.searchParams.get("exec");
      if (exec) myshell.postMessage(exec);
    }
  });

  socket.on("connect", function () {
    if (initDone) {
      console.log("Socket reconnected");
      // reconnect stuff
      if (!MINIMAL) syncChat();
      for (const e of emitStack) socket.oldEmit(e[0], e[1], e[2]); // not emit to avoid potential infinite loop
      emitStack.length = 0;
    } else console.log("Socket connected");
  });

  socket.on("output", socketOutput);
  socket.oldEmit = socket.emit;
  socket.emit = wrapEmitForDisconnect;
  socket.on("connect_error", socketError);
  socket.on("disconnect", socketDisconnect);

  document.body.onclick = clickAction;
  document.body.onkeydown = keydownAction;
  document.body.onmousedown = mousedownAction;
  document.body.oncontextmenu = rightclickAction;

  myshell = new Shell(
    document.getElementById("terminal"),
    (msg) => socket.emit("input", msg),
    document.getElementById("editorDiv"),
    document.getElementById("browseFrame") as HTMLFrameElement,
    true
  );

  socket.connect();
};

export { init, myshell, socket, url, clientId };
