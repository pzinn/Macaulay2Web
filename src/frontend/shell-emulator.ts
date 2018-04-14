// initialize with ID (string) of field that should act like a shell,
//  i.e., command history, taking input and replacing it with output from server

// historyArea is a div in which we save the command for future use
// shell functions for
// * interrupt
/* eslint-env browser */
/* eslint "max-len": "off" */
const keys = {
    // The keys 37, 38, 39 and 40 are the arrow keys.
  arrowUp: 38,
  arrowDown: 40,
  arrowLeft: 37,
  arrowRight: 39,
  cKey: 67,
  zKey: 90,
  ctrlKeyCode: 17,
  metaKeyCodes: [224, 17, 91, 93],
  backspace: 8,
  tab: 9,
  enter: 13,
  ctrlc: "\x03",
};

import {Socket} from "./mathProgram";
const unicodeBell = "\u0007";
//const setCaretPosition = require("set-caret-position");
const scrollDown = require("scroll-down");
const getSelected = require("get-selected-text");
const cmdHistory: any = []; // History of commands for shell-like arrow navigation
cmdHistory.index = 0;
var tabString="";
var inputErase=false; 
// mathJax related stuff
var mathJaxState = "<!--txt-->"; // txt = normal output, html = ordinary html
var htmlComment= /(<!--txt-->|<!--html-->|\\\(|\\\))/; // the hope is, these sequences are never used in M2
var htmlCode=""; // saves the current html code to avoid rewriting
var texCode=""; // saves the current TeX code
var htmlSec; // html element of current html code
declare var katex;
var inputDiv = document.getElementById("M2OutInput"); // or could just shell[0].lastChildNode or something

function dehtml(s) {
    s=s.replace(/&amp;/g,"&");
    s=s.replace(/&lt;/g,"<");
    s=s.replace(/&gt;/g,">");
    s=s.replace(/&quot;/g,"\"");
    return s;
}


function placeCaretAtEnd() {
    inputDiv.focus();
    // way more complicated than should be
    var range = document.createRange();
    range.selectNodeContents(inputDiv);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

const postRawMessage = function(msg: string, socket: Socket) {
  socket.emit("input", msg);
  return true;
};

const interrupt = function(socket: Socket) {
  return function() {
    postRawMessage(keys.ctrlc, socket);
  };
};

const sendCallback = function(id: string, socket: Socket, shell) { // called by pressing Evaluate
  return function() {
      tabString="";
      inputDiv.textContent="";
    const str = getSelected(id);
    postRawMessage(str, socket);
    return false;
  };
};

const sendOnEnterCallback = function(id: string, socket: Socket, shell) { // shift-enter in editor
  return function(e) {
    if (e.which === 13 && e.shiftKey) {
      tabString="";
      inputDiv.textContent="";
      e.preventDefault();
      // do not make a line break or remove selected text when sending
      const msg = getSelected(id);
      // We only trigger the innerTrack.
      shell.trigger("innerTrack", msg);
      postRawMessage(msg, socket);
    }
  };
};

const getCurrentCommand = function(shell): string {
    inputErase=true;
    return inputDiv.textContent;
};

const upDownArrowKeyHandling = function(shell, e: KeyboardEvent) {
    e.preventDefault();
    if (cmdHistory.length === 0) {
        // Maybe we did nothing so far.
	return;
    }
    if (e.keyCode === keys.arrowDown) { // DOWN
	if (cmdHistory.index < cmdHistory.length) {
	    cmdHistory.index++;
	    if (cmdHistory.index === cmdHistory.length) {
		inputDiv.textContent=cmdHistory.current;
	    } else {
		inputDiv.textContent=cmdHistory[cmdHistory.index];
	    }
	}
    }
    else if ((e.keyCode === keys.arrowUp) && (cmdHistory.index > 0)) { // UP
	if (cmdHistory.index === cmdHistory.length) {
	    cmdHistory.current = inputDiv.textContent;
	}
	cmdHistory.index--;
	inputDiv.textContent=cmdHistory[cmdHistory.index];
    }
    placeCaretAtEnd();
    scrollDown(shell);
};

module.exports = function() {
  const create = function(shell, historyArea, socket: Socket) {
    const history = historyArea;
    history.keypress(sendOnEnterCallback("M2In", socket, shell));

    shell.on("track", function(e, msg) { // add command to history
      if (typeof msg !== "undefined") {
        if (history !== undefined) {
          history.val(history.val() + msg + "\n");
          scrollDown(history);
        }
        shell.trigger("innerTrack", msg);
      }
    });

    shell.on("postMessage", function(e, msg) {
      shell.trigger("track", msg);
      postRawMessage(msg, socket);
    });

    shell.on("innerTrack", function(e, msg) {
        // This function will track the messages, i.e. such that arrow up and
        // down work, but it will not put the msg in the history textarea. We
        // need this if someone uses the shift+enter functionality in the
        // history area, because we do not want to track these messages.
      const input = msg.split("\n");
      for (const line in input) {
        if (input[line].length > 0) {
          cmdHistory.index = cmdHistory.push(input[line]);
        }
      }
    });

    const packageAndSendMessage = function(msg) {
	placeCaretAtEnd();
	if (msg.length>0)
            postRawMessage(msg, socket);
       else {
        console.log("There must be an error.");
            // We don't want empty lines send to M2 at pressing return twice.
       }
    };

      shell.bind('paste',function(e) { inputDiv.focus();
				     });
/*	  var msg = "";
	  var sel = window.getSelection();
	  var lst = lastText(shell);
	  var s = lst.textContent;
	  var nd,of;
	  if ("baseNode" in sel) { nd = sel.baseNode; of = sel.baseOffset; } // chrome
	  else { nd = sel.focusNode; of = sel.focusOffset; } // firefox. these fields exist in chrome but give different answers :(
	  if (nd instanceof Text) {
	      var ss = nd.textContent;
	      var i = ss.lastIndexOf(" : ",of-1); // bit of a hack...
	      if (i>=0) {
		  var j = ss.indexOf("\n\n",of); // same
		  if (j>=0) {
		      msg = ss.substring(i+3,j);
		  }
	      }
	  }
	  if (msg=="") msg = (e.originalEvent || e).clipboardData.getData('text/plain');
	  if ((nd != lst) || (of < mathProgramOutput.length)) 
	      of = s.length; // same as lst.length
	  lst.textContent=s.substring(0,of)+msg+s.substring(of,s.length); // note s.length rather than s.length-1 to avoid switching of arguments
	  // compared to the default behavior, prevents crappy <div></div> when \n
	  sel.collapse(lst,of+msg.length);
	  scrollDown(shell);
	  return false;
      });*/ // TODO rewrite

    // If something is entered, change to end of textarea, if at wrong position.
      shell.keydown(function(e: KeyboardEvent) {
      if (e.keyCode === keys.enter) {
	  const msg=getCurrentCommand(shell);
          shell.trigger("track", tabString+msg); tabString="";
	  inputDiv.textContent+="\n "; // extra space necessary, sadly -- see the related <div></div> issue below
	  packageAndSendMessage(msg+"\n");
	  scrollDown(shell);
	  return false; // no crappy <div></div> added
      }

      if ((e.keyCode === keys.arrowUp) || (e.keyCode === keys.arrowDown)) {
          upDownArrowKeyHandling(shell, e);
	  return;
      }

	  if (e.ctrlKey || (e.keyCode === keys.ctrlKeyCode)) { // do not jump to bottom on Ctrl
        return;
      }
        // for MAC OS
      if ((e.metaKey && e.keyCode === keys.cKey) || (keys.metaKeyCodes.indexOf(e.keyCode) > -1)) { // do not jump to bottom on Command+C or on Command
        return;
      }
      inputDiv.focus();

	  /*
      if (e.ctrlKey && e.keyCode === keys.cKey) {
        interrupt(socket);
      }
*/ // TODO rewrite. for now CTRL-C is usual "copy"

	// Forward key for tab completion, but do not track it.
	if (e.keyCode === keys.tab) {
	    var msg = getCurrentCommand(shell);
	    tabString+=msg+"\t"; // slightly messed up: if we use arrow keys the text will appear with a tab
          packageAndSendMessage(msg+"\t");
        e.preventDefault();
      }
    });

    shell.on("onmessage", function(e, msgDirty) {
      if (msgDirty === unicodeBell) {
        return;
      }
        // If we get a 'Session resumed.' message, we check whether it is
        // relevant.
	/*
      if (msgDirty.indexOf("Session resumed.") > -1) {
        if (mathProgramOutput.length > 0) { 
          return;
        }
      }
*/ // TODO rewrite

	if (inputErase) { inputDiv.textContent=""; inputErase=false; }
	if (!htmlSec) { // for very first time
	    htmlSec=document.createElement('span');
	    shell[0].insertBefore(htmlSec,inputDiv);
	}
      let msg: string = msgDirty.replace(/\u0007/, "");
      msg = msg.replace(/\r\n/g, "\n");
      msg = msg.replace(/\r/g, "\n");
      var txt=msg.split(htmlComment);
      for (var i=0; i<txt.length; i+=2)
	{
	    if (i>0) {
		mathJaxState=txt[i-1];
		if (mathJaxState=="<!--html-->") { // html section beginning
		    htmlSec=document.createElement('span');
		    htmlSec.style.whiteSpace="initial"; // !!! should probably define a class
		    shell[0].insertBefore(htmlSec,inputDiv);
		    htmlCode=""; // need to record because html tags may get broken
		}
		else if (mathJaxState=="\\(") { // tex section beginning
		    texCode="";
		}
		else if (mathJaxState=="\\)") { // tex section ending
		    texCode=dehtml(texCode);
		    htmlSec.innerHTML=htmlCode+=katex.renderToString(texCode);
		}
		else if (mathJaxState=="<!--txt-->") {
		    htmlSec=document.createElement('span');
		    shell[0].insertBefore(htmlSec,inputDiv);
		}
	    }
	    if (txt[i].length>0) {
		if (mathJaxState=="<!--txt-->") htmlSec.textContent+=txt[i]; // simpler
		    /*
		    if (htmlSec.children.length == 0) // needed because chrome refuses to create empty text nodes
			htmlSec.appendChild(document.createTextNode(txt[i]));
		    else
			htmlSec.children[0].textContent+=txt[i];
		    */
		else if (mathJaxState=="\\(") texCode+=txt[i];
		else htmlSec.innerHTML=htmlCode+=txt[i];
	    }
	}
	scrollDown(shell);
    });

      shell.on("reset", function() {
	  tabString="";
	  inputDiv.textContent="";
    });
  };

  return {
    create,
    sendCallback,
    interrupt,
  };
};
