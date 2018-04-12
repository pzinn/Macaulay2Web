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
let mathProgramOutput = "";
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

function dehtml(s) {
    s=s.replace(/&amp;/g,"&");
    s=s.replace(/&lt;/g,"<");
    s=s.replace(/&gt;/g,">");
    s=s.replace(/&quot;/g,"\"");
    return s;
}


function placeCaretAtEnd(shell,flag?) { // flag means only put at end if outside the input area
    shell[0].focus(); // what's that for?
    var sel = window.getSelection();
    var lst = lastText(shell);
    var nd,of;
    if ("baseNode" in sel) { nd = sel.baseNode; of = sel.baseOffset; } // chrome
    else { nd = sel.focusNode; of = sel.focusOffset; } // firefox. these fields exist in chrome but give different answers :(
    if ((!flag)||(nd!=lst)||(of<mathProgramOutput.length))
    {
	sel.collapse(lst,lst.length);
	return lst.length;
    }
    else return of;
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
      lastText(shell).textContent=mathProgramOutput;
    const str = getSelected(id);
    postRawMessage(str, socket);
    return false;
  };
};

const sendOnEnterCallback = function(id: string, socket: Socket, shell) { // shift-enter in editor
  return function(e) {
    if (e.which === 13 && e.shiftKey) {
      tabString="";
      lastText(shell).textContent=mathProgramOutput;
      e.preventDefault();
      // do not make a line break or remove selected text when sending
      const msg = getSelected(id);
      // We only trigger the innerTrack.
      shell.trigger("innerTrack", msg);
      postRawMessage(msg, socket);
    }
  };
};

const lastText = function(shell) {
    if ((shell[0].lastChild===null) || !(shell[0].lastChild instanceof Text)) shell[0].appendChild(document.createTextNode(""));
    return shell[0].lastChild;
}

const getCurrentCommand = function(shell): string {
    const completeText = lastText(shell);
    let lastLine: string = completeText.textContent.substring(mathProgramOutput.length);
    //    completeText.textContent=mathProgramOutput;
    inputErase=true;
    return lastLine;
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
		lastText(shell).textContent=mathProgramOutput+cmdHistory.current;
	    } else {
		lastText(shell).textContent=mathProgramOutput+cmdHistory[cmdHistory.index];
	    }
	}
	placeCaretAtEnd(shell);
    }
    else if ((e.keyCode === keys.arrowUp) && (cmdHistory.index > 0)) { // UP
	if (cmdHistory.index === cmdHistory.length) {
	    cmdHistory.current = lastText(shell).textContent.substring(mathProgramOutput.length);
	}
	cmdHistory.index--;
	lastText(shell).textContent=mathProgramOutput+cmdHistory[cmdHistory.index];
	placeCaretAtEnd(shell,true);
    }
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
	placeCaretAtEnd(shell);
	if (msg.length>0)
            postRawMessage(msg, socket);
       else {
        console.log("There must be an error.");
            // We don't want empty lines send to M2 at pressing return twice.
       }
    };

      shell.bind('paste',function(e) {
	  var msg = "";
	  var sel = window.getSelection();
	  var lst = lastText(shell);
	  var s = lst.textContent;
	  var nd,of;
	  if ("baseNode" in sel) { nd = sel.baseNode; of = sel.baseOffset; } // chrome
	  else { nd = sel.focusNode; of = sel.focusOffset; } // firefox. these fields exist in chrome but give different answers :(
	  if ((nd instanceof Text)&&(nd != lst)) {
	      var ss = nd.textContent;
	      var i = ss.lastIndexOf(" : "); // bit of a hack...
	      if ((i>=0)&&(i<of-2)) {
		  ss=ss.substring(i+3,ss.length-1);
		  var j = ss.indexOf("\n\n"); // same
		  if (i+3+j>=of) {
		      msg = ss.substring(0,j);
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
      });

    // If something is entered, change to end of textarea, if at wrong position.
    shell.keydown(function(e: KeyboardEvent) {
      if (e.keyCode === keys.enter) {
	  const msg=getCurrentCommand(shell);
          shell.trigger("track", tabString+msg); tabString="";
	  lastText(shell).textContent+="\n "; // extra space necessary, sadly -- see the related <div></div> issue below
	  packageAndSendMessage(msg+"\n");
	  scrollDown(shell);
	  return false; // no crappy <div></div> added
      }

      if ((e.keyCode === keys.arrowUp) || (e.keyCode === keys.arrowDown)) {
          upDownArrowKeyHandling(shell, e);
	  return;
      }
      if (e.keyCode === keys.ctrlKeyCode) { // do not jump to bottom on Ctrl+C or on Ctrl
        return;
      }
      if (e.ctrlKey && e.keyCode === keys.cKey) {
        interrupt(socket);
      }
        // for MAC OS
      if ((e.metaKey && e.keyCode === keys.cKey) || (keys.metaKeyCodes.indexOf(e.keyCode) > -1)) { // do not jump to bottom on Command+C or on Command
        return;
      }

	// Forward key for tab completion, but do not track it.
	if (e.keyCode === keys.tab) {
	    var msg = getCurrentCommand(shell);
	    tabString+=msg+"\t"; // slightly messed up: if we use arrow keys the text will appear with a tab
          packageAndSendMessage(msg+"\t");
        e.preventDefault();
      }
	var pos=placeCaretAtEnd(shell,true);

        // This deals with backspace and left arrow.
	if ((e.keyCode === keys.backspace)||(e.keyCode === keys.arrowLeft)) {
          if (pos <= mathProgramOutput.length) e.preventDefault();
      }
    });

    shell.on("onmessage", function(e, msgDirty) {
      if (msgDirty === unicodeBell) {
        return;
      }
        // If we get a 'Session resumed.' message, we check whether it is
        // relevant.
      if (msgDirty.indexOf("Session resumed.") > -1) {
        if (mathProgramOutput.length > 0) { // TODO change
          return;
        }
      }

	if (inputErase) { lastText(shell).textContent=mathProgramOutput; inputErase=false; }
	
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
		    htmlSec.contentEditable="false"; // !!! should probably define a class
		    shell[0].appendChild(htmlSec);
		    htmlCode="";
		}
		if (mathJaxState=="\\(") { // tex section beginning
		    texCode="";
		}
		if (mathJaxState=="\\)") { // tex section ending
		    texCode=dehtml(texCode);
		    if (htmlCode!="") htmlSec.innerHTML=htmlCode+=katex.renderToString(texCode);
		    else katex.render(texCode,htmlSec);
		}
	    }
	    if (txt[i].length>0) {
		if (mathJaxState=="<!--txt-->") lastText(shell).textContent+=txt[i];
		else if (mathJaxState=="\\(") texCode+=txt[i];
		else htmlSec.innerHTML=htmlCode+=txt[i];
	    }
	}
	mathProgramOutput=lastText(shell).textContent;
	placeCaretAtEnd(shell);
	scrollDown(shell);
    });

      shell.on("reset", function() {
	  tabString="";
	  lastText(shell).textContent=mathProgramOutput;
    });
  };

  return {
    create,
    sendCallback,
    interrupt,
  };
};
