/* eslint-env browser */
"use strict";

import io = require("socket.io-client");
const SocketIOFileUpload = require("socketio-file-upload");
//const Prism = require("prismjs");

type Socket = SocketIOClient.Socket & { oldEmit?: any };

export { Socket };
let socket: Socket;
let serverDisconnect = false;
const Shell = require("./shellEmulator");
import { scrollDownLeft, caretIsAtEnd } from "./htmlTools";
import { webAppTags } from "../frontend/tags";
import {
  barKey,
  hideContextMenu,
  barMouseDown,
  barRightClick,
  unselectCells,
} from "./bar";

let myshell;
let tutorialManager;
let siofu;

const getSelected = function () {
  // similar to trigger the paste event (except for when there's no selection and final \n) (which one can't manually, see below)
  const sel = window.getSelection() as any; // modify is still "experimental"
  if (document.getElementById("editorDiv").contains(sel.focusNode)) {
    // only if we're inside the editor
    if (sel.isCollapsed) {
      sel.modify("move", "backward", "lineboundary");
      sel.modify("extend", "forward", "lineboundary");
      const s = sel.toString();
      // sel.modify("move", "forward", "line"); // doesn't work in firefox
      sel.collapseToEnd();
      sel.modify("move", "forward", "character");
      return s;
    } else return sel.toString(); // fragInnerText(sel.getRangeAt(0).cloneContents()); // toString used to fail because ignored BR / DIV which firefox creates
  } else return "";
};

const editorEvaluate = function () {
  const msg = getSelected();
  myshell.postMessage(msg, false, false); // important not to move the pointer so can move to next line
  document.getElementById("editorDiv").focus(); // in chrome, this.blur() would be enough, but not in firefox
  /*
    const input = msg.split("\n");
    for (var line=0; line<input.length; line++) {
    if ((line<input.length-1)||(msg[msg.length-1]=="\n"))
    myshell.postMessage(input[line], false, false);
    }
    */
  // doesn't work -- feeding line by line is a bad idea, M2 then spits out input twice
  /*
    var dataTrans = new DataTransfer();
    dataTrans.setData("text/plain",msg);
    var event = new ClipboardEvent('paste',{clipboardData: dataTrans});
    document.getElementById("terminal").dispatchEvent(event);
    */
  // sadly, doesn't work either -- cf https://www.w3.org/TR/clipboard-apis/
  // "A synthetic paste event can be manually constructed and dispatched, but it will not affect the contents of the document."
};

const keydownAction = function (e) {
  if (e.key == "F1") {
    //    const sel = window.getSelection().toString();
    const sel = e.currentTarget.ownerDocument.getSelection().toString(); // works in iframe too
    if (sel != "") socket.emit("input", 'viewHelp "' + sel + '"\n');
    e.preventDefault();
    e.stopPropagation();
  } else if (e.target.classList.contains("M2CellBar")) barKey(e);
};

const editorKeyDown = function (e) {
  //    var prismInvoked=false;
  if (e.key == "Enter" && e.shiftKey) {
    if (!caretIsAtEnd()) e.preventDefault();
    const msg = getSelected();
    myshell.postMessage(msg, false, false);
  } else if (e.key == "Tab") {
    e.preventDefault();
    document.execCommand("insertHTML", false, "&#009"); // tab inserts an actual tab for now (auto-complete?)
  }
};

const attachClick = function (id: string, f) {
  const el = document.getElementById(id);
  if (el) el.onclick = f;
};

const attachMinMaxBtnActions = function () {
  const dialog: any = document.getElementById("fullScreenOutput");
  if (dialog) {
    const maximize = document.getElementById("maximizeOutput");
    const downsize = document.getElementById("downsizeOutput");
    const zoomBtns = document.getElementById("terminalZoomBtns");
    const output = document.getElementById("terminal");
    dialog.onclose = function () {
      const oldPosition = document.getElementById("right-half");
      const ctrl = document.getElementById("terminalCtrlBtns");
      oldPosition.appendChild(output);
      ctrl.insertBefore(zoomBtns, maximize);
      scrollDownLeft(output);
    };
    attachClick("maximizeOutput", function () {
      const maxCtrl = document.getElementById("terminalCtrlBtnsMax");
      /*    if (!dialog.showModal) {
		  dialogPolyfill.registerDialog(dialog);
		  }*/
      dialog.appendChild(output);
      maxCtrl.insertBefore(zoomBtns, downsize);
      dialog.showModal();
      output.focus();
      scrollDownLeft(output);
    });
    attachClick("downsizeOutput", function () {
      dialog.close();
    });
  }
};

const emitReset = function () {
  myshell.reset();
  socket.emit("reset");
};

const clearOut = function () {
  const out = document.getElementById("terminal");
  while (out.childElementCount > 1) out.removeChild(out.firstChild);
};

/*
const toggleWrap = function () {
  const out = document.getElementById("terminal");
  const btn = document.getElementById("wrapBtn");
  btn.classList.toggle("rotated");
  out.classList.toggle("M2Wrapped");
};
*/

const attachCtrlBtnActions = function () {
  attachClick("sendBtn", editorEvaluate);
  attachClick("resetBtn", emitReset);
  attachClick("interruptBtn", myshell.interrupt);
  attachClick("saveBtn", saveFile);
  attachClick("loadBtn", loadFile);
  attachClick("hiliteBtn", hilite);
  attachClick("clearBtn", clearOut);
  //  attachClick("wrapBtn", toggleWrap);
};

let fileName = "default.m2";

const loadFile = function () {
  const dialog = document.createElement("input");
  dialog.setAttribute("type", "file"),
    dialog.addEventListener("change", loadFileProcess, false);
  dialog.click();
};

const loadFileProcess = function (event) {
  if (event.target.files.length > 0) {
    const fileToLoad = event.target.files[0];
    fileName = fileToLoad.name;
    const fileReader = new FileReader();
    fileReader.onload = function () {
      // var textFromFileLoaded = e.target.result;
      const textFromFileLoaded = fileReader.result;
      document.getElementById("editorDiv").innerHTML = Prism.highlight(
        textFromFileLoaded,
        Prism.languages.macaulay2
      );
      document.getElementById("editorTitle").click();
    };
    fileReader.readAsText(fileToLoad, "UTF-8");

    if ((document.getElementById("autoUpload") as HTMLInputElement).checked) {
      event.target.files[0].auto = true;
      siofu.submitFiles(event.target.files);
    }
  }
};

const saveFile = function () {
  const input = document.getElementById("editorDiv");
  const content = input.innerText as string;

  if ((document.getElementById("autoUpload") as HTMLInputElement).checked) {
    const file = new File([content], fileName);
    (file as any).auto = true;
    siofu.submitFiles([file]);
  }

  const inputLink =
    "data:application/octet-stream," + encodeURIComponent(content);
  const inputParagraph = document.createElement("a");
  inputParagraph.setAttribute("href", inputLink);
  inputParagraph.setAttribute("download", fileName); // reuses the last loaded file name
  inputParagraph.click();
};

const hilite = function () {
  const input = document.getElementById("editorDiv");
  input.innerHTML = Prism.highlight(input.innerText, Prism.languages.macaulay2);

  // what follows doesn't preserve caret location
  /*
  var txt = input.textContent;

  document.execCommand("selectAll");
  document.execCommand(
    "insertHTML",
    false,
    Prism.highlight(txt, Prism.languages.macaulay2)
  );
*/
};

const showUploadSuccessDialog = function (event) {
  if (!event.file.auto) {
    const dialog: any = document.getElementById("uploadSuccessDialog");
    // console.log('we uploaded the file: ' + event.success);
    // console.log(event.file);
    const filename = event.file.name;
    // console.log("File uploaded successfully!" + filename);
    const successSentence =
      filename +
      " has been uploaded and you can use it by loading it into your session.";
    document.getElementById(
      "uploadSuccessDialogContent"
    ).innerText = successSentence;
    dialog.showModal();
  }
};

const attachCloseDialogBtns = function () {
  attachClick("uploadSuccessDialogClose", function () {
    (document.getElementById("uploadSuccessDialog") as any).close();
  });
  attachClick("showFileDialogClose", function () {
    (document.getElementById("showFileDialog") as any).close();
  });
};

const socketOnDisconnect = function (msg) {
  console.log("We got disconnected. " + msg);
  myshell.onmessage(
    webAppTags.Text +
      "Sorry, your session was disconnected" +
      " by the server.\n"
  );
  myshell.reset();
  serverDisconnect = true;
  // Could use the following to automatically reload. Probably too invasive,
  // might kill results.
  // location.reload();
};

const wrapEmitForDisconnect = function (event, msg) {
  if (serverDisconnect) {
    const events = ["reset", "input"];
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
  if ((e.target as HTMLElement).classList.contains("M2CellBar"))
    e.stopPropagation();
  // bar stuff is handled my mousedown, not click (needed for shift-click)
  else {
    unselectCells(e.currentTarget.ownerDocument);
    if (
      e.target.tagName.substring(0, 4) == "CODE" ||
      e.target.classList.contains("M2PastInput") // a bit weak: no propagation
    )
      myshell.codeInputAction.call(e.target, e);
  }
};

const mousedownAction = function (e) {
  if (e.button != 0) return;
  if (e.target.classList.contains("M2CellBar"))
    barMouseDown(e, e.target.classList.contains("M2Left"));
};

const rightclickAction = function (e) {
  if (e.target.classList.contains("M2CellBar")) barRightClick(e);
};

// supersedes mdl's internal tab handling
const openTab = function () {
  let loc = document.location.hash.substring(1);
  // new syntax for navigating tutorial
  const m = /^tutorial(?:-(\d*))?(?:-(\d*))?$/.exec(loc);
  if (m) {
    loc = "tutorial";
    if (m[1] || m[2])
      tutorialManager.loadLessonIfChanged(+m[1] || 0, (+m[2] || 1) - 1);
  }
  const panel = document.getElementById(loc);
  if (panel) {
    const tab = document.getElementById(loc + "Title");
    const tabs = document.getElementById("tabs") as any;
    if (tabs.MaterialTabs) {
      tabs.MaterialTabs.resetPanelState_();
      tabs.MaterialTabs.resetTabState_();
    }
    panel.classList.add("is-active");
    tab.classList.add("is-active");
  }
};

let ignoreFirstLoad = true;
const openBrowseTab = function (event) {
  const tabs = document.getElementById("tabs");
  const el = document.getElementById("browseTitle");
  // show tab panel
  if (el && tabs.classList.contains("is-upgraded")) {
    if (ignoreFirstLoad) ignoreFirstLoad = false;
    else el.click();
  }
  // try to enable actions
  const iFrame = document.getElementById("browseFrame") as HTMLIFrameElement;
  if (iFrame && iFrame.contentDocument && iFrame.contentDocument.body) {
    const bdy = iFrame.contentDocument.body;
    bdy.onclick = clickAction;
    bdy.onkeydown = keydownAction;
    bdy.onmousedown = mousedownAction;
    bdy.oncontextmenu = rightclickAction;
  }
  // do not follow link
  event.preventDefault();
};

const socketOnMessage = function (msg) {
  if (msg !== "") {
    myshell.onmessage(msg);
  }
};

const socketOnCookie = function (cookie) {
  document.cookie = cookie;
};

const socketOnError = function (type) {
  return function (error) {
    console.log("We got an " + type + " error. " + error);
    serverDisconnect = true;
  };
};

const queryCookie = function () {
  const cookie = document.cookie;
  const i = cookie.indexOf("user"); // not too subtle
  if (i < 0)
    alert("You don't have a cookie (presumably, you're in public mode)");
  else
    alert("The user id stored in your cookie is: " + cookie.substring(i + 4));
};

const init = function () {
  if (!navigator.cookieEnabled) {
    alert("This site requires cookies to be enabled.");
    return;
  }
  const url = new URL(document.location.href);

  let ioParams = "";
  let publicId: any = url.searchParams.get("public");
  const userId: any = url.searchParams.get("user");
  if (publicId !== null) {
    if (publicId == "") publicId = "Default";
    ioParams = "?publicId=" + publicId;
  } else if (userId !== null && userId != "") {
    ioParams = "?userId=" + userId;
  } else if (url.pathname == "/minimal.html") {
    // minimal interface public by default
    ioParams = "?publicId=Default";
  }

  const zoom = require("./zooming");
  zoom.attachZoomButtons(
    "terminal",
    "terminalZoomIn",
    "terminalResetZoom",
    "terminalZoomOut"
  );

  socket = io(ioParams);
  socket.on("reconnect_failed", socketOnError("reconnect_fail"));
  socket.on("reconnect_error", socketOnError("reconnect_error"));
  socket.on("connect_error", socketOnError("connect_error"));
  socket.on("result", socketOnMessage);
  socket.on("disconnect", socketOnDisconnect);
  socket.on("cookie", socketOnCookie);
  socket.oldEmit = socket.emit;
  socket.emit = wrapEmitForDisconnect;
  //  socket.on("file", fileDialog);

  const editor = document.getElementById("editorDiv");

  // take care of default editor text
  if (editor) {
    const xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function () {
      if (this.readyState == 4 && this.status == 200) {
        editor.innerHTML = Prism.highlight(
          xhttp.responseText,
          Prism.languages.macaulay2
        );
      }
    };
    xhttp.open("GET", "default.m2.txt", true);
    xhttp.send();
  }

  let tab = url.hash;

  const loadtute = url.searchParams.get("loadtutorial");
  const upTutorial = document.getElementById("uptutorial");
  if (upTutorial) {
    const m = /^#tutorial(?:-(\d*))?(?:-(\d*))?$/.exec(tab);
    let tute = 0,
      page = 1;
    if (m) {
      tute = +m[1] || 0;
      page = +m[2] || 1;
    }
    tutorialManager = require("./tutorials")(tute, page - 1);
    const fetchTutorials = require("./fetchTutorials");
    fetchTutorials(tutorialManager.makeTutorialsList, loadtute);
    upTutorial.onchange = tutorialManager.uploadTutorial;
  }

  const tabs = document.getElementById("tabs");
  if (tabs) {
    document.location.hash = "";
    window.addEventListener("hashchange", openTab);
    if (tab === "")
      if (loadtute) tab = "#tutorial";
      else tab = "#home";
    document.location.hash = tab;
  }

  const iFrame = document.getElementById("browseFrame");
  const terminal = document.getElementById("terminal");
  myshell = new Shell(
    terminal,
    socket,
    editor,
    document.getElementById("editorToggle"),
    iFrame
  );

  attachMinMaxBtnActions();
  attachCtrlBtnActions();
  attachCloseDialogBtns();

  if (editor) editor.onkeydown = editorKeyDown;

  siofu = new SocketIOFileUpload(socket);
  attachClick("uploadBtn", siofu.prompt);
  siofu.addEventListener("complete", showUploadSuccessDialog);

  // must add this due to failure of mdl, see https://stackoverflow.com/questions/31536467/how-to-hide-drawer-upon-user-click
  const drawer = document.querySelector(".mdl-layout__drawer");
  if (drawer)
    drawer.addEventListener(
      "click",
      function () {
        document
          .querySelector(".mdl-layout__obfuscator")
          .classList.remove("is-visible");
        this.classList.remove("is-visible");
      },
      false
    );
  // supersede mdl's built-in tab handling
  Array.from(document.getElementsByClassName("mdl-tabs__tab")).forEach((el) => {
    (el as any).onclick = function (event) {
      event.stopImmediatePropagation();
    };
  });

  if (editor)
    // only ask for confirmation if there's an editor
    window.addEventListener("beforeunload", function (e) {
      e.preventDefault();
      e.returnValue = "";
    });

  const cookieQuery = document.getElementById("cookieQuery");
  if (cookieQuery) cookieQuery.onclick = queryCookie;

  const exec = url.searchParams.get("exec");
  if (exec)
    setTimeout(function () {
      myshell.postMessage(exec, false, false);
    }, 2000);

  if (iFrame) iFrame.onload = openBrowseTab;

  //  attachClick("content", codeClickAction);
  document.body.onclick = clickAction;
  document.body.onkeydown = keydownAction;
  document.body.onmousedown = mousedownAction;
  document.body.oncontextmenu = rightclickAction;
};

export { init, myshell };
