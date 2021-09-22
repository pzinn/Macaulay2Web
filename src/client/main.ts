/* eslint-env browser */
"use strict";
declare const MINIMAL;

import { Socket as Socket0, io } from "socket.io-client";

import {
  extra1,
  extra2,
  getCookieId,
  setCookieId,
  newEditorFileMaybe,
} from "./extra";
import { syncChat } from "./chat";

type Socket = Socket0 & { oldEmit?: any };

export { Socket };
let socket: Socket;
let serverDisconnect = false;
import { Shell } from "./shellEmulator";

import {
  barKey,
  hideContextMenu,
  barMouseDown,
  barRightClick,
  unselectCells,
} from "./bar";

import { options } from "../common/global";

let myshell = null; // the terminal
let clientId = MINIMAL ? "public" : getCookieId(); // client's id. it's public / in the cookie,
// but can be overwritten by url or chosen by server if no cookie

const keydownAction = function (e) {
  if (e.key == "F1") {
    e.preventDefault();
    e.stopPropagation();
    //    const sel = window.getSelection().toString();
    const sel = e.currentTarget.ownerDocument.getSelection().toString().trim(); // works in iframe too
    if (sel == "") return;
    socket.emit("input", 'viewHelp "' + sel + '"\n');
  } else if (!MINIMAL && e.key == "Alt") {
    // one of the few keys that don't kill selection outside contentEditable
    e.preventDefault();
    e.stopPropagation();
    let sel = e.currentTarget.ownerDocument.getSelection().toString().trim(); // works in iframe too
    const ind = sel.indexOf("\n");
    if (ind >= 0) sel = sel.substring(0, ind); // just cleaning up a bit more
    if (sel == "") return;
    newEditorFileMaybe(sel, false);
  } else if (e.target.classList.contains("M2CellBar"))
    barKey(e, e.target.parentElement);
};

const socketDisconnect = function (msg) {
  console.log("We got disconnected. " + msg);
  serverDisconnect = true;
};

const socketError = function (error) {
  console.log("Socket error. " + error);
  serverDisconnect = true;
};

const wrapEmitForDisconnect = function (event, msg, callback?) {
  if (serverDisconnect) {
    const events = ["reset", "input", "chat", "fileexists"]; // !!!
    console.log("We are disconnected.");
    if (events.indexOf(event) >= 0) {
      socket.connect();
      if (!MINIMAL) syncChat();
      serverDisconnect = false; // not really... we could still be disconnected, obviously
      socket.oldEmit(event, msg, callback);
    }
  } else {
    socket.oldEmit(event, msg, callback);
  }
  return socket;
};

const fixAnchor = function (t: HTMLAnchorElement) {
  const url = t.href;
  if (!t.target) {
    if (MINIMAL || (t.host && t.host != window.location.host))
      t.target = "_blank";
    else if (!t.hash) t.target = "browse";
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
      (t.tagName == "CODE" || t.classList.contains("M2PastInput")) &&
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
  unselectCells(e.currentTarget.ownerDocument);
};

const mousedownAction = function (e) {
  if (e.button != 0) return;
  if (e.target.classList.contains("M2CellBar")) barMouseDown(e);
};

const rightclickAction = function (e) {
  if (e.target.classList.contains("M2CellBar")) barRightClick(e);
};

const socketOutput = function (msg: string) {
  myshell.displayOutput(msg);
};

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
      resetBtn.firstElementChild.textContent = "Start";
      resetBtn.lastElementChild.innerHTML =
        "<i class='material-icons'>not_started</i>";
      resetBtn.classList.add("startButton");
      resetBtn.onclick = function (e) {
        e.stopPropagation();
        resetBtn.firstElementChild.textContent = "Reset";
        resetBtn.lastElementChild.innerHTML =
          "<i class='material-icons'>replay</i>";
        resetBtn.classList.remove("startButton");
        clientId = getCookieId(); // in the unlikely event that it got changed while we were waiting
        init2();
      };
      return;
    }
  }
  init2();
};

let initDone = false;

const init2 = function () {
  if (!MINIMAL)
    document.getElementById("terminalDiv").style.display = "initial";
  let ioParams = "?version=" + options.version;
  if (clientId) ioParams += "&id=" + clientId;
  socket = io(ioParams);
  socket.on("instance", function (id) {
    console.log("Instance with id " + id);
    if (id != clientId) {
      // new id was generated
      clientId = id;
      if (!MINIMAL) setCookieId();
    }
    if (!MINIMAL) {
      if (!initDone) {
        extra2();
        initDone = true;
      }
    }
  });
  socket.on("connect_error", socketError);
  socket.on("output", socketOutput);
  socket.on("disconnect", socketDisconnect);
  socket.oldEmit = socket.emit;
  socket.emit = wrapEmitForDisconnect;

  document.body.onclick = clickAction;
  document.body.onkeydown = keydownAction;
  document.body.onmousedown = mousedownAction;
  document.body.oncontextmenu = rightclickAction;

  myshell = new Shell(
    document.getElementById("terminal"),
    socket,
    document.getElementById("editorDiv"),
    document.getElementById("editorToggle") as HTMLInputElement,
    document.getElementById("browseFrame") as HTMLFrameElement,
    true
  );

  //  window.addEventListener("load", function () {
  socket.emit("restore");
  //  });

  const exec = url.searchParams.get("exec");
  if (exec)
    setTimeout(function () {
      myshell.postMessage(exec, false, false);
    }, 2000); // weak
};

export { init, myshell, socket, url, clientId };
