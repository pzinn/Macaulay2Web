/* eslint-env browser */
"use strict";
declare const MINIMAL;

import socketIo from "socket.io-client";

import { extra, setCookie, getCookieId } from "./extra";
import { syncChat } from "./chat";

type Socket = SocketIOClient.Socket & { oldEmit?: any };

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
    //    const sel = window.getSelection().toString();
    const sel = e.currentTarget.ownerDocument.getSelection().toString(); // works in iframe too
    if (sel != "") socket.emit("input", 'viewHelp "' + sel + '"\n');
    e.preventDefault();
    e.stopPropagation();
  } else if (e.target.classList.contains("M2CellBar"))
    barKey(e, e.target.parentElement);
};

const socketDisconnect = function (msg) {
  console.log("We got disconnected. " + msg);
  serverDisconnect = true;
};

const wrapEmitForDisconnect = function (event, msg, callback?) {
  if (serverDisconnect) {
    const events = ["reset", "input", "chat"]; // !!!
    console.log("We are disconnected.");
    if (events.indexOf(event) >= 0) {
      socket.connect();
      if (!MINIMAL) syncChat();
      serverDisconnect = false;
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
  while (t != e.currentTarget) {
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

const setId = function (id: string): void {
  clientId = id;
  console.log("Client id " + clientId);
  if (!MINIMAL && cookieFlag) setCookie(options.cookieName, clientId);
};

const socketOutput = function (msg: string) {
  myshell.displayOutput(msg);
};

const socketError = function (type) {
  return function (error) {
    console.log("We got an " + type + " error. " + error);
    serverDisconnect = true;
  };
};

const url = new URL(document.location.href);

let cookieFlag = true; // we could write !MINIMAL here but for tree shaking purposes we don't :/

const init = function () {
  if (!MINIMAL && !navigator.cookieEnabled) {
    alert("This site requires cookies to be enabled.");
    return;
  }

  console.log("Macaulay2Web version " + options.version);
  const userId: any = url.searchParams.get("user");
  if (userId) {
    const newId = "user" + userId;
    if (!MINIMAL) {
      if (clientId !== newId) {
        const dialog = document.getElementById(
          "changeUserDialog"
        ) as HTMLDialogElement;
        document.getElementById("newUserId").textContent = userId;
        document.getElementById("oldUserIdReminder").innerHTML = clientId
          ? "Choosing `permanent' will overwrite the current id <b>" +
            clientId.substring(4) +
            "</b> in your cookie."
          : "";
        dialog.onclose = function () {
          if (dialog.returnValue == "temporary") cookieFlag = false;
          setId(newId);
          init2();
        };
        dialog.showModal();
        return;
      }
    }
    setId(newId);
  } else if (clientId) setId(clientId); // reset the clock
  init2();
};

const init2 = function () {
  let ioParams = "?version=" + options.version;
  if (clientId) ioParams += "&id=" + clientId;
  socket = socketIo(ioParams);
  socket.on("reconnect_failed", socketError("reconnect_fail"));
  socket.on("reconnect_error", socketError("reconnect_error"));
  socket.on("connect_error", socketError("connect_error"));
  socket.on("output", socketOutput);
  socket.on("disconnect", socketDisconnect);
  socket.on("id", setId);
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

  if (!MINIMAL) extra();

  const exec = url.searchParams.get("exec");
  if (exec)
    setTimeout(function () {
      myshell.postMessage(exec, false, false);
    }, 2000); // weak
};

export { init, myshell, socket, url, clientId };
