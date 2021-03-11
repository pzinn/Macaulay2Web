/* eslint-env browser */
"use strict";
declare const MINIMAL;

import socketIo from "socket.io-client";

import {
  extra1,
  extra2,
  setCookie,
  getCookieId,
  setCookieId,
  dockerToEditor,
} from "./extra";
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

import { setCaret } from "./htmlTools";

import { options } from "../common/global";

let myshell = null; // the terminal
let clientId = MINIMAL ? "public" : getCookieId(); // client's id. it's public / in the cookie,
// but can be overwritten by url or chosen by server if no cookie

const keydownAction = function (e) {
  if (e.key == "F1") {
    e.preventDefault();
    e.stopPropagation();
    //    const sel = window.getSelection().toString();
    const sel = e.currentTarget.ownerDocument.getSelection().toString(); // works in iframe too
    if (sel == "") return;
    socket.emit("input", 'viewHelp "' + sel + '"\n');
  } else if (!MINIMAL && e.key == "Alt") {
    // one of the few keys that doesn't kill selection outside contentEditable
    // of course this stuff shouldn't be in main.ts -- TEMP
    e.preventDefault();
    e.stopPropagation();
    const sel = e.currentTarget.ownerDocument.getSelection().toString(); // works in iframe too
    if (sel == "") return;
    // figure out filename
    const m = sel.match(/([^:]*)(?::(\d+)(?::(\d+)|)(?:-(\d+)(?::(\d+)|)|)|)/); // e.g. test.m2:3:5-5:7
    if (!m) return;
    dockerToEditor(
      m[1],
      false, // no overwrite dialog
      function () {
        document.location.hash = "editor";
        // find location in file
        if (!m[2]) return;
        let row1 = +m[2];
        if (row1 < 1) row1 = 1;
        let col1 = m[3] ? +m[3] : 1;
        if (col1 < 1) col1 = 1;
        let row2 = m[5] ? +m[4] : row1;
        if (row2 < row1) row2 = row1;
        let col2 = m[5] ? +m[5] : m[4] ? +m[4] : col1;
        if (row2 == row1 && col2 < col1) col2 = col1;
        const editor = document.getElementById("editorDiv");
        const editorText = editor.innerText;
        let j = -1;
        let k = 1;
        let j1;
        while (true) {
          if (k == row1) j1 = j;
          if (k == row2) break;
          j = editorText.indexOf("\n", j + 1);
          if (j < 0) {
            setCaret(editor, editorText.length);
            return;
          }
          k++;
        }
        if (m[4]) setCaret(editor, j1 + col1, j + col2 + 1);
        else setCaret(editor, j1 + col1);
        // painful way of getting scrolling to work
        setTimeout(function () {
          // in case not in editor tab, need to wait
          document.execCommand("insertHTML", false, "<span id='scrll'></span>");
          document.getElementById("scrll").scrollIntoView();
          document.execCommand("undo", false, null);
        }, 0);
      },
      function () {}
    );
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

const socketError = function (type) {
  return function (error) {
    console.log("We got an " + type + " error. " + error);
    serverDisconnect = true;
  };
};

const url = new URL(document.location.href);

const cookieFlag = true; // we could write !MINIMAL here but for tree shaking purposes we don't :/

const init = function () {
  if (!MINIMAL && !navigator.cookieEnabled) {
    alert("This site requires cookies to be enabled.");
    return;
  }

  console.log("Macaulay2Web version " + options.version);

  if (!MINIMAL) extra1();

  const userId: any = url.searchParams.get("user");
  const newId = userId ? "user" + userId : "";
  if (userId && clientId !== newId) {
    if (MINIMAL) clientId = newId;
    else {
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
        clientId = newId;
        if (dialog.returnValue !== "temporary") setCookieId();
        init2();
      };
      dialog.showModal();
      return;
    }
  } else if (!MINIMAL) {
    if (clientId) setCookieId();
    // reset the cookie clock
    else {
      const resetBtn = document.getElementById("resetBtn");
      resetBtn.firstElementChild.textContent = "Start";
      resetBtn.firstElementChild.classList.add("startButton");
      resetBtn.onclick = function (e) {
        e.stopPropagation();
        resetBtn.firstElementChild.textContent = "Reset";
        resetBtn.firstElementChild.classList.remove("startButton");
        init2();
      };
      return;
    }
  }
  init2();
};

const init2 = function () {
  let ioParams = "?version=" + options.version;
  if (clientId) ioParams += "&id=" + clientId;
  socket = socketIo(ioParams);
  socket.on("instance", function (id) {
    console.log("Instance with id " + id);
    if (id != clientId) {
      // new id was generated
      clientId = id;
      if (!MINIMAL) setCookieId();
    }
    if (!MINIMAL) {
      setCookie(options.cookieInstanceName, clientId);
      extra2();
    }
  });
  socket.on("reconnect_failed", socketError("reconnect_fail"));
  socket.on("reconnect_error", socketError("reconnect_error"));
  socket.on("connect_error", socketError("connect_error"));
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
