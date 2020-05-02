/* global SocketIOFileUpload, mathProgramName, DefaultText */
/* eslint-env browser */
"use strict";

declare var mathProgramName: string;
declare var DefaultText: string;
import io = require("socket.io-client");
declare var SocketIOFileUpload: any;
declare var Prism;

type Socket =  SocketIOClient.Socket & {oldEmit?: any};

export {Socket};
let socket: Socket;
let serverDisconnect = false;
const dialogPolyfill = require("dialog-polyfill");
const shell = require("./shell-emulator");
const tools = require("./htmlTools");

const mathJaxTags = require("../frontend/tags");

var myshell;

const getSelected = function () { // similar to trigger the paste event (except for when there's no selection and final \n) (which one cna't manually, see below)
    var sel=window.getSelection();
    if (document.getElementById("M2In").contains(sel.focusNode)) { // only if we're inside the editor
	if (sel.isCollapsed) {
	    (<any>sel).modify("move", "backward", "lineboundary");
	    (<any>sel).modify("extend", "forward", "lineboundary");
	    //	    var s=sel.toString(); // doesn't work in firefox because replaces "\n" with " "
	    var s=sel.getRangeAt(0).cloneContents().textContent;
	    (<any>sel).modify("move", "forward", "line");
	    return s+"\n";
	}
	else return sel.getRangeAt(0).cloneContents().textContent;
    }
    else return "";
};

const editorEvaluate = function() {
    const msg = getSelected();
    myshell.postMessage(msg, false, false); // important not to move the pointer so can move to next line
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

const editorKeypress = function(e) {
//    var prismInvoked=false;
      if (e.which === 13 && e.shiftKey) {
	  e.preventDefault();
	  const msg = getSelected();
	  myshell.postMessage(msg, false, true);
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

const attachMinMaxBtnActions = function() {
  const maximize = document.getElementById("maximizeOutput");
  const downsize = document.getElementById("downsizeOutput");
  const zoomBtns = document.getElementById("M2OutZoomBtns");
  maximize.addEventListener("click", function() {
    const dialog: any = document.getElementById("fullScreenOutput");
    const maxCtrl = document.getElementById("M2OutCtrlBtnsMax");
    if (!dialog.showModal) {
      dialogPolyfill.registerDialog(dialog);
    }
    const output = document.getElementById("M2Out");
    dialog.appendChild(output);
    maxCtrl.insertBefore(zoomBtns, downsize);
    dialog.showModal();
    tools.scrollDownLeft(output);
  });
  downsize.addEventListener("click", function() {
    const dialog: any = document.getElementById("fullScreenOutput");
    const oldPosition = document.getElementById("right-half");
    const output = document.getElementById("M2Out");
    const ctrl = document.getElementById("M2OutCtrlBtns");
    oldPosition.appendChild(output);
    ctrl.insertBefore(zoomBtns, maximize);
    dialog.close();
    tools.scrollDownLeft(output);
  });
};

const emitReset = function() {
    myshell.reset();
    socket.emit("reset");
};

const ClearOut = function(e) {
    var out = document.getElementById("M2Out");
    while (out.childElementCount>1) out.removeChild(out.firstChild);
}

const attachCtrlBtnActions = function() {
    document.getElementById("sendBtn").onclick = editorEvaluate;
    document.getElementById("resetBtn").onclick = emitReset;
    document.getElementById("interruptBtn").onclick = myshell.interrupt;
    document.getElementById("saveBtn").onclick=saveFile;
    document.getElementById("loadBtn").onclick=loadFile;
    document.getElementById("hiliteBtn").onclick=hilite;
    document.getElementById("clearBtn").onclick=ClearOut;
};

var fileName = "default.m2";

const loadFile = function(event) {
    var dialog = document.createElement("input");
    dialog.setAttribute("type", "file"),
    dialog.addEventListener("change",loadFileProcess,false);
    dialog.click();
};

const loadFileProcess = function(event) {
    if (event.target.files.length>0) {
	var fileToLoad = event.target.files[0];
	fileName = fileToLoad.name;
	var fileReader = new FileReader();
	fileReader.onload = function(e)
	{
	    // var textFromFileLoaded = e.target.result;
	    var textFromFileLoaded = fileReader.result;
            //$("#M2In").text(textFromFileLoaded);
	    document.getElementById("M2In").innerHTML=Prism.highlight(textFromFileLoaded,Prism.languages.macaulay2);
	    document.getElementById("editorTitle").click();
	};
	fileReader.readAsText(fileToLoad, "UTF-8");
    }
};

const removeBR = function() { // for firefox only: remove <br> in the editor and replace with \n
    const input = document.getElementById("M2In");
    var i=0;
    while (i<input.childElementCount) {
	if (input.children[i].tagName == "BR") {
	    input.insertBefore(document.createTextNode("\n"),input.children[i]);
	    input.removeChild(input.children[i]);
	} else if (input.children[i].tagName == "DIV") { // normally should never happen
	    input.insertBefore(document.createTextNode(input.children[i].textContent+"\n"),input.children[i]);
	    input.removeChild(input.children[i]);
	} else i++;
    }
}

const saveFile = function() {
    const input = document.getElementById("M2In");
    removeBR();
    const inputLink = "data:application/octet-stream," +
	encodeURIComponent(input.textContent as string);
    var inputParagraph = document.createElement("a");
    inputParagraph.setAttribute("href", inputLink);
    inputParagraph.setAttribute("download", fileName); // reuses the last loaded file name
    inputParagraph.click();
};



const hilite = function(event) {
    removeBR();
    document.getElementById("M2In").innerHTML=Prism.highlight(document.getElementById("M2In").textContent,Prism.languages.macaulay2);
}

const showUploadSuccessDialog = function(event) {
  const dialog: any = document.getElementById("uploadSuccessDialog");
  if (!dialog.showModal) {
    dialogPolyfill.registerDialog(dialog);
  }
  // console.log('we uploaded the file: ' + event.success);
  // console.log(event.file);
  const filename = event.file.name;
  // console.log("File uploaded successfully!" + filename);
  const successSentence = filename +
      " has been uploaded and you can use it by loading it into your " +
      mathProgramName + " session.";
  document.getElementById("uploadSuccessDialogContent").innerText =
      successSentence;
  dialog.showModal();
};

const attachCloseDialogBtns = function() {
  document.getElementById("uploadSuccessDialogClose").addEventListener("click",
      function() {
          (document.getElementById("uploadSuccessDialog") as any).close();
      });
};

const socketOnDisconnect = function(msg) {
    console.log("We got disconnected. " + msg);
    myshell.onmessage(mathJaxTags.Text +
			"Sorry, your session was disconnected" +
			" by the server.\n\n");
    myshell.reset();
    serverDisconnect = true;
  // Could use the following to automatically reload. Probably too invasive,
  // might kill results.
  // location.reload();
};

const wrapEmitForDisconnect = function(event, msg) {
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

const codeClickAction = function(e) {
    if (e.target.tagName.substring(0,4)=="CODE")
	myshell.postMessage(e.target.textContent,false,false);
};


const openTabCloseDrawer = function(event) {
  const panelId = this.href;
  // show tab panel
  document.getElementById(panelId).click();
  // close drawer menu
  (document.body.querySelector(".mdl-layout__obfuscator.is-visible") as any).click();
  // do not follow link
  event.preventDefault();
};

const openAboutTab = function(event) {
  // show tab panel
  document.getElementById("helpTitle").click();
  // do not follow link
  event.preventDefault();
};

const socketOnMessage = function(msg) {
  if (msg !== "") {
      myshell.onmessage(msg);
  }
};

const socketOnCookie = function(cookie) {
  document.cookie = cookie;
};

const socketOnError = function(type) {
  return function(error) {
    console.log("We got an " + type + " error. " + error);
    serverDisconnect = true;
  };
};

const assignClick = function(lst, f) {
    for (var i=0; i<lst.length; i++)
	lst[i].onclick=f;
}

const init = function() {
    const zoom = require("./zooming");
    zoom.attachZoomButtons("M2Out", "M2OutZoomIn", "M2OutResetZoom", "M2OutZoomOut");

    socket = io();
    socket.on("reconnect_failed", socketOnError("reconnect_fail"));
    socket.on("reconnect_error", socketOnError("reconnect_error"));
    socket.on("connect_error", socketOnError("connect_error"));
    socket.on("result", socketOnMessage);
    socket.on("disconnect", socketOnDisconnect);
    socket.on("cookie", socketOnCookie);
    socket.oldEmit = socket.emit;
    socket.emit = wrapEmitForDisconnect;

    const tutorialManager = require("./tutorials")();
    const fetchTutorials = require("./fetchTutorials");
    fetchTutorials(tutorialManager.makeTutorialsList);
    document.getElementById("uptutorial").onchange=tutorialManager.uploadTutorial;

    myshell = new shell.Shell(document.getElementById("M2Out"), socket,
			      document.getElementById("M2In"), document.getElementById("editorToggle"));

    attachMinMaxBtnActions();
    attachCtrlBtnActions();
    attachCloseDialogBtns();

    document.getElementById("M2In").onkeypress=editorKeypress;
    
    const siofu = new SocketIOFileUpload(socket);
    document.getElementById("uploadBtn").addEventListener("click", siofu.prompt, false);
    siofu.addEventListener("complete", showUploadSuccessDialog);

    document.getElementById("content").onclick=codeClickAction;
    assignClick(document.getElementsByClassName("tabPanelActivator"), openTabCloseDrawer);
    document.getElementById("about").onclick = openAboutTab;

    window.addEventListener('beforeunload', function (e) {
	e.preventDefault();
	e.returnValue = '';
    });
};

module.exports = function() {
  init();
};
