/* eslint-env browser */
"use strict";
declare const MINIMAL;

import socketIo from "socket.io-client";

//import Cookie from "cookie";

import extra from "./extra";

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

import { options } from "../server/startupConfigs/global";

let myshell = null;

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
  /*  myshell.onmessage(
    webAppTags.Text +
      "Sorry, your session was disconnected" +
      " by the server.\n"
  );
  myshell.reset();*/
  serverDisconnect = true;
  // Could use the following to automatically reload. Probably too invasive,
  // might kill results.
  // location.reload();
};

const wrapEmitForDisconnect = function (event, msg) {
  if (serverDisconnect) {
    const events = ["reset", "input", "chat"];
    console.log("We are disconnected.");
    if (events.indexOf(event) !== -1) {
      socket.connect();
      serverDisconnect = false;
      socket.oldEmit(event, msg);
    }
  } else {
    socket.oldEmit(event, msg);
  }
  return socket;
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
      (t.tagName.substring(0, 4) == "CODE" ||
        t.classList.contains("M2PastInput")) &&
      t.ownerDocument.getSelection().isCollapsed
    ) {
      e.stopPropagation();
      myshell.codeInputAction(t);
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

const setCookie = function (cookie) {
  document.cookie = cookie;
};

const socketError = function (type) {
  return function (error) {
    console.log("We got an " + type + " error. " + error);
    serverDisconnect = true;
  };
};

const url = new URL(document.location.href);

const init = function () {
  if (!navigator.cookieEnabled) {
    alert("This site requires cookies to be enabled.");
    return;
  }

  let ioParams = "?version=" + options.version;
  let publicId: any = url.searchParams.get("public");
  const userId: any = url.searchParams.get("user");
  if (publicId !== null) {
    if (publicId == "") publicId = "Default";
    ioParams += "&publicId=" + publicId;
  } else if (userId !== null && userId != "") {
    ioParams += "&userId=" + userId;
  } else if (url.pathname == "/minimal.html") {
    // minimal interface public by default
    ioParams += "&publicId=Default";
  }

  socket = socketIo(ioParams);
  socket.on("reconnect_failed", socketError("reconnect_fail"));
  socket.on("reconnect_error", socketError("reconnect_error"));
  socket.on("connect_error", socketError("connect_error"));
  socket.on("output", socketOutput);
  socket.on("disconnect", socketDisconnect);
  socket.on("cookie", setCookie);
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
    document.getElementById("browseFrame") as HTMLFrameElement
  );

  window.addEventListener("load", function () {
    socket.emit("restore");
  });

  if (!MINIMAL) extra();

  const exec = url.searchParams.get("exec");
  if (exec)
    setTimeout(function () {
      myshell.postMessage(exec, false, false);
    }, 2000); // weak
};

export { init, myshell, socket, setCookie, url };
