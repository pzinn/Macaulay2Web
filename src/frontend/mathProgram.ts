/* global SocketIOFileUpload, mathProgramName, DefaultText */
/* eslint-env browser */

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
const shell = require("./shell-emulator")();
const scrollDown = require("scroll-down");

import * as $ from "jquery";
import * as tags from "./tags";

const getSelected = function (){ // could almost just trigger the paste event, except for when there's no selection and final \n...
    var sel=window.getSelection();
    if (document.getElementById("M2In").contains(sel.focusNode)) { // only if we're inside the editor
	if (sel.isCollapsed) {
	    (<any>sel).modify("move", "backward", "lineboundary");
	    (<any>sel).modify("extend", "forward", "lineboundary");
	    //	    var s=sel.toString(); // doesn't work in firefox because replaces "\n" with " "
	    var s=sel.getRangeAt(0).cloneContents().textContent;
	    (<any>sel).modify("move", "forward", "line");
	    return s;
	}
	else return sel.getRangeAt(0).cloneContents().textContent;
    }
    else return "";
};

const editorEvaluate = function() {
    var msg = getSelected();
    if (msg != "")
	$("#M2Out").trigger("postMessage", [msg, false, false]);
  };

const editorKeypress = function(e) {
//    var prismInvoked=false;
      if (e.which === 13 && e.shiftKey) {
	  e.preventDefault();
	  var msg = getSelected();
	  if (msg != "")
	      $("#M2Out").trigger("postMessage", [msg, false, true]);
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
      scrollDown($("#M2Out"));
  });
  downsize.addEventListener("click", function() {
    const dialog: any = document.getElementById("fullScreenOutput");
    const oldPosition = document.getElementById("right-half");
    const output = document.getElementById("M2Out");
    const ctrl = document.getElementById("M2OutCtrlBtns");
    oldPosition.appendChild(output);
    ctrl.insertBefore(zoomBtns, maximize);
    dialog.close();
      scrollDown($("#M2Out"));
  });
};

const attachTutorialNavBtnActions = function(switchLesson) {
  $("#previousBtn").click(function() {
    switchLesson(-1);
  });

  $("#nextBtn").click(function() {
    switchLesson(1);
  });
};

const emitReset = function() {
  $("#M2Out").trigger("reset");
  socket.emit("reset");
};

const ClearOut = function(e) {
    var out = document.getElementById("M2Out");
    while (out.childElementCount>1) out.removeChild(out.firstChild);
}

const attachCtrlBtnActions = function() {
    $("#sendBtn").click(editorEvaluate);
    $("#resetBtn").click(emitReset);
    $("#interruptBtn").click(shell.interrupt(socket));
    $("#saveBtn").click(saveFile);
    $("#loadBtn").click(loadFile);
    $("#hiliteBtn").click(hilite);
    $("#clearBtn").click(ClearOut);
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
	    $("#M2In").html(Prism.highlight(textFromFileLoaded,Prism.languages.macaulay2));
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
    const input = $("#M2In");
    removeBR();
    const inputLink = "data:application/octet-stream," +
	encodeURIComponent(input.text() as string);
    var inputParagraph = document.createElement("a");
    inputParagraph.setAttribute("href", inputLink);
    inputParagraph.setAttribute("download", fileName); // reuses the last loaded file name
    inputParagraph.click();
};



const hilite = function(event) {
    removeBR();
    $("#M2In").html(Prism.highlight($("#M2In").text(),Prism.languages.macaulay2));
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

const showImageDialog = function(imageUrl) {
  if (imageUrl) {
    const dialog: any = document.getElementById("showImageDialog");
    if (!dialog.showModal) {
      dialogPolyfill.registerDialog(dialog);
    }
    // console.log("We received an image: " + imageUrl);
    const btn = document.getElementById("showImageDialogBtn");
    // Get rid of old click event listeners.
    const btnClone = btn.cloneNode(true);
    const content = document.getElementById("showImageDialogContent");
    content.innerText = "";
    content.appendChild(btnClone);
    btnClone.addEventListener("click", function() {
      window.open(imageUrl, "_blank",
          "height=200,width=200,toolbar=0,location=0,menubar=0");
      dialog.close();
    });
    content.appendChild(document.createTextNode(imageUrl.split("/").pop()));
    dialog.showModal();
  }
};

const attachCloseDialogBtns = function() {
  document.getElementById("uploadSuccessDialogClose").addEventListener("click",
      function() {
          (document.getElementById("uploadSuccessDialog") as any).close();
      });
  document.getElementById("showImageDialogClose").addEventListener("click",
      function() {
          (document.getElementById("showImageDialog") as any).close();
      });
};

const socketOnDisconnect = function(msg) {
    console.log("We got disconnected. " + msg);
    $("#M2Out").trigger("onmessage", tags.mathJaxTextTag +
			"Sorry, your session was disconnected" +
			" by the server.\n\n");
    $("#M2Out").trigger("reset");
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

/*const displayUrlInNewWindow = function(url) {
  if (url) {
    window.open(url, "M2 Help");
  }
};
*/

const codeClickAction = function() {
    $("#M2Out").trigger("postMessage", [$(this).text(),false,false]);
};


const openTabCloseDrawer = function(event) {
  const panelId = $(this).attr("href");
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
    $("#M2Out").trigger("onmessage", msg);
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

const init = function() {
  const zoom = require("./zooming");
  zoom.attachZoomButtons("M2Out", "M2OutZoomIn", "M2OutResetZoom",
      "M2OutZoomOut");

  socket = io();
  socket.on("reconnect_failed", socketOnError("reconnect_fail"));
  socket.on("reconnect_error", socketOnError("reconnect_error"));
  socket.on("connect_error", socketOnError("connect_error"));
  socket.on("result", socketOnMessage);
  socket.on("disconnect", socketOnDisconnect);
  socket.on("cookie", socketOnCookie);
  socket.oldEmit = socket.emit;
  socket.emit = wrapEmitForDisconnect;
  socket.on("image", showImageDialog);
//  socket.on("viewHelp", displayUrlInNewWindow);

  const tutorialManager = require("./tutorials")();
  const fetchTutorials = require("./fetchTutorials");
  fetchTutorials(tutorialManager.makeTutorialsList);
  $("#uptutorial").on("change", tutorialManager.uploadTutorial);
  $(document).on("click", ".submenuItem", tutorialManager.showLesson);

  attachTutorialNavBtnActions(tutorialManager.switchLesson);
  attachMinMaxBtnActions();
  attachCtrlBtnActions();
  attachCloseDialogBtns();

  // $("#M2In").text(DefaultText);
  // $("#M2In").html(Prism.highlight(DefaultText,Prism.languages.macaulay2));

  shell.create($("#M2Out"), $("#M2In"), socket);

  $("#M2In").keypress(editorKeypress);

    
  const siofu = new SocketIOFileUpload(socket);
  document.getElementById("uploadBtn").addEventListener("click", siofu.prompt,
      false);
  siofu.addEventListener("complete", showUploadSuccessDialog);

  $(document).on("click", "code", codeClickAction);
  $(document).on("click", "codeblock", codeClickAction);
  $(document).on("click", ".tabPanelActivator", openTabCloseDrawer);
  $(document).on("click", "#about", openAboutTab);

};

module.exports = function() {
  init();
};
