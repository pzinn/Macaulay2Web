/* global SocketIOFileUpload, mathProgramName, DefaultText */
/* eslint-env browser */
"use strict";

declare const mathProgramName: string;
declare const DefaultText: string;
import io = require("socket.io-client");
//declare const SocketIOFileUpload: any;
const SocketIOFileUpload = require("socketio-file-upload");
const Prism = require("prismjs");

type Socket = SocketIOClient.Socket & { oldEmit?: any };

export { Socket };
let socket: Socket;
let serverDisconnect = false;
//const dialogPolyfill = require("dialog-polyfill");
const shell = require("./shell-emulator");
import { scrollDownLeft, caretIsAtEnd } from "./htmlTools";

import { webAppTags, webAppClasses } from "../frontend/tags";

let myshell;

const getSelected = function () {
  // similar to trigger the paste event (except for when there's no selection and final \n) (which one can't manually, see below)
  const sel = window.getSelection() as any; // modify is still "experimental"
  if (document.getElementById("M2In").contains(sel.focusNode)) {
    // only if we're inside the editor
    if (sel.isCollapsed) {
      sel.modify("move", "backward", "lineboundary");
      sel.modify("extend", "forward", "lineboundary");
      // const s=sel.toString(); // doesn't work in firefox because replaces "\n" with " "
      const s = sel.getRangeAt(0).cloneContents().textContent;
      // sel.modify("move", "forward", "line"); // doesn't work in firefox
      sel.collapseToEnd();
      sel.modify("move", "forward", "character");
      return s + "\n";
    } else return sel.getRangeAt(0).cloneContents().textContent;
  } else return "";
};

const editorEvaluate = function () {
  removeBR();
  const msg = getSelected();
  myshell.postMessage(msg, false, false); // important not to move the pointer so can move to next line
  document.getElementById("M2In").focus(); // in chrome, this.blur() would be enough, but not in firefox
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
    document.getElementById("M2Out").dispatchEvent(event);
    */
  // sadly, doesn't work either -- cf https://www.w3.org/TR/clipboard-apis/
  // "A synthetic paste event can be manually constructed and dispatched, but it will not affect the contents of the document."
};

const editorKeypress = function (e) {
  //    var prismInvoked=false;
  if (e.key == "Enter" && e.shiftKey) {
    removeBR();
    if (!caretIsAtEnd()) e.preventDefault();
    const msg = getSelected();
    myshell.postMessage(msg, false, false);
  }
  /*
    if (!prismInvoked) {
	prismInvoked=true;
	window.setTimeout( function() {
	    // the trickiest part is to preserve the selection/caret
	    $("#M2In").html(Prism.highlight($("#M2In").text(),Prism.languages.macaulay2));
	    prismInvoked=false;
	}, 1000 );
    };
*/
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
    const zoomBtns = document.getElementById("M2OutZoomBtns");
    const output = document.getElementById("M2Out");
    dialog.onclose = function () {
      const oldPosition = document.getElementById("right-half");
      const ctrl = document.getElementById("M2OutCtrlBtns");
      oldPosition.appendChild(output);
      ctrl.insertBefore(zoomBtns, maximize);
      scrollDownLeft(output);
    };
    attachClick("maximizeOutput", function () {
      const maxCtrl = document.getElementById("M2OutCtrlBtnsMax");
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

const clearOut = function (e) {
  const out = document.getElementById("M2Out");
  while (out.childElementCount > 1) out.removeChild(out.firstChild);
};

const attachCtrlBtnActions = function () {
  attachClick("sendBtn", editorEvaluate);
  attachClick("resetBtn", emitReset);
  attachClick("interruptBtn", myshell.interrupt);
  attachClick("saveBtn", saveFile);
  attachClick("loadBtn", loadFile);
  attachClick("hiliteBtn", hilite);
  attachClick("clearBtn", clearOut);
};

let fileName = "default.m2";

const loadFile = function (event) {
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
    fileReader.onload = function (e) {
      // var textFromFileLoaded = e.target.result;
      const textFromFileLoaded = fileReader.result;
      document.getElementById("M2In").innerHTML = Prism.highlight(
        textFromFileLoaded,
        Prism.languages.macaulay2
      );
      document.getElementById("editorTitle").click();
    };
    fileReader.readAsText(fileToLoad, "UTF-8");
  }
};

const removeBR = function () {
  // for firefox only: remove <br> in the editor and replace with \n
  const input = document.getElementById("M2In");
  let i = 0;
  while (i < input.childElementCount) {
    if (input.children[i].tagName == "BR") {
      if (i != input.childElementCount - 1)
        // firefox always adds an extra useless <br> at the end
        input.insertBefore(document.createTextNode("\n"), input.children[i]);
      input.removeChild(input.children[i]);
    } else if (input.children[i].tagName == "DIV") {
      // same for DIV
      input.insertBefore(
        document.createTextNode(input.children[i].textContent + "\n"),
        input.children[i]
      );
      input.removeChild(input.children[i]);
    } else i++;
  }
};

const saveFile = function () {
  const input = document.getElementById("M2In");
  removeBR();
  const inputLink =
    "data:application/octet-stream," +
    encodeURIComponent(input.textContent as string);
  const inputParagraph = document.createElement("a");
  inputParagraph.setAttribute("href", inputLink);
  inputParagraph.setAttribute("download", fileName); // reuses the last loaded file name
  inputParagraph.click();
};

const hilite = function (event) {
  removeBR();
  document.getElementById("M2In").innerHTML = Prism.highlight(
    document.getElementById("M2In").textContent,
    Prism.languages.macaulay2
  );
};

const showUploadSuccessDialog = function (event) {
  const dialog: any = document.getElementById("uploadSuccessDialog");
  /*  if (!dialog.showModal) {
    dialogPolyfill.registerDialog(dialog);
  }*/
  // console.log('we uploaded the file: ' + event.success);
  // console.log(event.file);
  const filename = event.file.name;
  // console.log("File uploaded successfully!" + filename);
  const successSentence =
    filename +
    " has been uploaded and you can use it by loading it into your " +
    mathProgramName +
    " session.";
  document.getElementById(
    "uploadSuccessDialogContent"
  ).innerText = successSentence;
  dialog.showModal();
};

/*
const fileDialog = function (fileUrl) {
  const iFrame = document.getElementById("browseFrame") as HTMLIFrameElement;
  if (iFrame) iFrame.src = fileUrl;
  else
    window.open(
      fileUrl,
      "_blank",
      "height=200,width=200,toolbar=0,location=0,menubar=0"
    );
};
*/

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
      " by the server.\n\n"
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

const codeClickAction = function (e) {
  if (
    e.target.tagName.substring(0, 4) == "CODE" &&
    window.getSelection().isCollapsed
  )
    myshell.postMessage(e.target.textContent, false, false);
};

const openTabCloseDrawer = function (event) {
  const panelId = this.getAttribute("href").substring(1) + "Title"; // probably not the right way, but works
  // show tab panel
  document.getElementById(panelId).click();
  // close drawer menu
  (document.body.querySelector(
    ".mdl-layout__obfuscator.is-visible"
  ) as any).click();
  // do not follow link
  event.preventDefault();
};

const openAboutTab = function (event) {
  const el = document.getElementById("aboutTitle");
  // show tab panel
  if (el) el.click();
  // do not follow link
  event.preventDefault();
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
  // try to enable links
  const iFrame = document.getElementById("browseFrame") as HTMLIFrameElement;
  if (iFrame && iFrame.contentDocument && iFrame.contentDocument.body)
    (iFrame as any).contentDocument.body.onclick = function (e) {
      myshell.ancSearch(e.target as HTMLElement, iFrame.contentDocument.body);
    };
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

const init = function () {
  const zoom = require("./zooming");
  zoom.attachZoomButtons(
    "M2Out",
    "M2OutZoomIn",
    "M2OutResetZoom",
    "M2OutZoomOut"
  );

  socket = io();
  socket.on("reconnect_failed", socketOnError("reconnect_fail"));
  socket.on("reconnect_error", socketOnError("reconnect_error"));
  socket.on("connect_error", socketOnError("connect_error"));
  socket.on("result", socketOnMessage);
  socket.on("disconnect", socketOnDisconnect);
  socket.on("cookie", socketOnCookie);
  socket.oldEmit = socket.emit;
  socket.emit = wrapEmitForDisconnect;
  //  socket.on("file", fileDialog);

  const editor = document.getElementById("M2In");

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

  const iFrame = document.getElementById("browseFrame");
  const console = document.getElementById("M2Out");
  myshell = new shell.Shell(
    console,
    socket,
    editor,
    document.getElementById("editorToggle"),
    iFrame
  );

  attachMinMaxBtnActions();
  attachCtrlBtnActions();
  attachCloseDialogBtns();

  if (editor) editor.onkeypress = editorKeypress;

  const siofu = new SocketIOFileUpload(socket);
  attachClick("uploadBtn", siofu.prompt);
  siofu.addEventListener("complete", showUploadSuccessDialog);

  attachClick("content", codeClickAction);
  Array.from(document.getElementsByClassName("tabPanelActivator")).forEach(
    (el) => {
      (el as any).onclick = openTabCloseDrawer;
    }
  );
  attachClick("aboutIcon", openAboutTab);

  if (editor)
    // only ask for confirmation if there's an editor
    window.addEventListener("beforeunload", function (e) {
      e.preventDefault();
      e.returnValue = "";
    });

  const url = new URL(document.location.href);
  const width = url.searchParams.get("width");
  if (width) console.style.width = width;
  const height = url.searchParams.get("height");
  if (height) console.style.height = height;
  const exec = url.searchParams.get("exec");
  if (exec)
    setTimeout(function () {
      myshell.postMessage(exec, false, false);
    }, 2000);

  let tab = url.hash.substr(1);

  const upTutorial = document.getElementById("uptutorial");
  if (upTutorial) {
    const tute = url.searchParams.get("tutorial");
    const page = url.searchParams.get("lesson"); // can do complicated things like http://localhost:8002/?tutorial=4&lesson=1#editor
    const tutorialManager = require("./tutorials")(+tute, +page);
    const fetchTutorials = require("./fetchTutorials");
    fetchTutorials(tutorialManager.makeTutorialsList);
    upTutorial.onchange = tutorialManager.uploadTutorial;
    if (tute !== null && tab === "") tab = "lessonTab";
  }

  const tabs = document.getElementById("tabs");
  if (tab && tabs) {
    const f = function () {
      if (tabs.classList.contains("is-upgraded"))
        // MDL js loaded
        document.getElementById(tab + "Title").click();
      else setTimeout(f, 100);
    };
    f();
  }

  if (iFrame) iFrame.onload = openBrowseTab;
};

module.exports = function () {
  init();
};
