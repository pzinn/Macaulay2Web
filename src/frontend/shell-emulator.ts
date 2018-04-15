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
//const getSelected = require("get-selected-text");
var cmdHistory: any = []; // History of commands for shell-like arrow navigation
cmdHistory.index = 0;
var inputSent=false;
var inputDiv = document.getElementById("M2CurrentInput"); // note that inputDiv should always have *one text node*
var tabMenu=null;
// mathJax related stuff
var mathJaxState = "<!--txt-->"; // txt = normal output, html = ordinary html
var htmlComment= /(<!--txt-->|<!--html-->|\\\(|\\\))/; // the hope is, these sequences are never used in M2
var htmlCode=""; // saves the current html code to avoid rewriting
var texCode=""; // saves the current TeX code
var htmlSec; // html element of current html code
declare var katex;
declare var Prism;
declare const M2symbols;

function dehtml(s) {
    s=s.replace(/&amp;/g,"&");
    s=s.replace(/&lt;/g,"<");
    s=s.replace(/&gt;/g,">");
    s=s.replace(/&quot;/g,"\"");
    return s;
}

function addToInput(pos,s) {
    var msg=inputDiv.textContent;
    inputDiv.textContent = msg.substring(0,pos)+s+msg.substring(pos,msg.length);
    // put the caret where it should be
    inputDiv.focus();
    var sel=window.getSelection();
    sel.collapse(sel.extentNode,pos+s.length);
}

function placeCaretAtEnd(flag?) { // flag means only do it if not already in input. returns position. remember inputDiv can only contain one (text) node
    if ((!flag)||(document.activeElement!=inputDiv))
    {
	inputDiv.focus();
	// way more complicated than should be. TODO: simplify (checking cross-browser) cf right above
	var range = document.createRange();
	range.selectNodeContents(inputDiv);
	range.collapse(false);
	var sel = window.getSelection();
	sel.removeAllRanges();
	sel.addRange(range);
	return inputDiv.textContent.length;
    }
    else return window.getSelection().extentOffset; // check with firefox
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
  const create = function(shell, editorArea, socket: Socket) {
    const editor = editorArea;

      shell.on("postMessage", function(e,msg,flag1,flag2,flag3) { // send input, adding \n if necessary
	  if (tabMenu) { shell[0].removeChild(tabMenu); tabMenu=null; } // remove tab menu if open
	  if (msg.length>0) {
	      if (msg[msg.length-1] != "\n") msg+="\n";
	      inputDiv.textContent=msg;
	      inputSent=true; // TODO: proper number
	      if (flag1&&((<any>document.getElementById("editorToggle")).checked)) shell.trigger("addToEditor",msg);
	      if (flag2) shell.trigger("addToHistory",msg);
	      if (flag3) placeCaretAtEnd();
	      postRawMessage(msg, socket);
	  }
      });

    shell.on("addToEditor", function(e, msg) { // add command to editor area
      if (typeof msg !== "undefined") {
        if (editor !== undefined) {
	    editor[0].appendChild(document.createTextNode(msg));
          scrollDown(editor);
        }
      }
    });

    shell.on("addToHistory", function(e, msg) {
        // This function will track the messages, i.e. such that arrow up and
        // down work, but it will not put the msg in the editor textarea. We
        // need this if someone uses the shift+enter functionality in the
        // editor area, because we do not want to track these messages.
      const input = msg.split("\n");
      for (const line in input) {
        if (input[line].length > 0) {
          cmdHistory.index = cmdHistory.push(input[line]);
        }
      }
    });

      shell.bind('paste',function(e) { placeCaretAtEnd(true); });

      shell.click(function(e) { if (window.getSelection().isCollapsed) placeCaretAtEnd(true) });

      const codeInputAction = function(e) {
	  // will only trigger if selection is empty
	  if (window.getSelection().isCollapsed)
	  {
	      //    this.classList.add("redbg");
	      this.className="redbg"; // a bit primitive
	      inputDiv.textContent = this.textContent;
	      this.addEventListener("transitionend", function () { this.className="M2PastInput"; });
	      placeCaretAtEnd();
	  }
      };

    // If something is entered, change to end of textarea, if at wrong position.
      shell.keydown(function(e: KeyboardEvent) {
	  if (tabMenu) { shell[0].removeChild(tabMenu); tabMenu=null; } // remove tab menu if open
      if (e.keyCode === keys.enter) {
	  const msg=inputDiv.textContent;
	  shell.trigger("postMessage",[msg,true,true,true]);
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
      var pos = placeCaretAtEnd(true);

	  /*
      if (e.ctrlKey && e.keyCode === keys.cKey) {
        interrupt(socket);
      }
*/ // TODO rewrite. for now CTRL-C is usual "copy"

	// Forward key for tab completion, but do not track it.
	  if (e.keyCode === keys.tab) {
	      var msg = inputDiv.textContent;
	      var i=pos-1;
	      while ((i>=0)&&(((msg[i]>="A")&&(msg[i]<="Z"))||((msg[i]>="a")&&(msg[i]<="z")))) i--; // would be faster with regex
	      var word = msg.substring(i+1,pos);
	      // find all M2symbols starting with last word of msg
	      var j=0;
	      while ((j<M2symbols.length)&&(M2symbols[j]<word)) j++;
	      if (j<M2symbols.length) {
		  var k=j;
		  while ((k<M2symbols.length)&&(M2symbols[k].substring(0,word.length)==word)) k++;
		  if (k>j) {
		      if (k==j+1) { // yay, one solution
			  addToInput(pos,M2symbols[j].substring(word.length,M2symbols[j].length)+" ");
		      }
		      else { // more interesting: several solutions
			  // obvious would've been datalist + input; sadly, the events generated by the input are 200% erratic, so can't use
			  tabMenu = document.createElement("ul"); tabMenu.classList.add("autocomplete");
			  for (var l=j; l<k; l++)
			  {
			      var opt = document.createElement("li");
			      opt.textContent=M2symbols[l];
			      opt.addEventListener("click", function() {
				  shell[0].removeChild(tabMenu); tabMenu=null;
				  addToInput(pos,this.textContent.substring(word.length,this.textContent.length)+" ");
			      });
			      tabMenu.appendChild(opt);
			  }
			  shell[0].appendChild(tabMenu);
			  scrollDown(shell);
		      }
		}
	    }
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
//	msgDirty = msgDirty.replace(/\u0008 \u0008/g,""); // we're removing the backspaces that have been possibly sent by the tab hack

      let msg: string = msgDirty.replace(/\u0007/, "");
      msg = msg.replace(/\r\n/g, "\n");
      msg = msg.replace(/\r/g, "\n");
	
	if (inputSent) {
	    inputDiv.textContent="";
	     // force new section when input got sent (avoids nasty hacks with parsing for prompt later)
	    htmlSec=document.createElement('span');
	    //	    htmlSec.classList.add('M2PastInput'); // a class that's designed to be reused, highlighted, etc
	    htmlSec.className="M2PastInput";
	    htmlSec.addEventListener("click", codeInputAction);
	    shell[0].insertBefore(htmlSec,inputDiv);
	}
	else if (!htmlSec) { // for very first time
	    htmlSec=document.createElement('span');
	    shell[0].insertBefore(htmlSec,inputDiv);
	}
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
		if (mathJaxState=="<!--txt-->") {
		    if (!inputSent)
			htmlSec.textContent+=txt[i];
		    else { // a bit messy: we're going to try to isolate [one line of] input for future purposes TODO: deal with multiple line input
			var j = txt[i].indexOf("\n");
			if (j<0) htmlSec.textContent+=txt[i];
			else {
			    htmlSec.textContent+=txt[i].substring(0,j);
			    htmlSec.innerHTML=Prism.highlight(htmlSec.textContent,Prism.languages.macaulay2);
			    htmlSec=document.createElement('span');
			    shell[0].insertBefore(htmlSec,inputDiv);
			    htmlSec.textContent=txt[i].substring(j,txt[i].length);
			    inputSent=false;
			}
		    }
		}
		else if (mathJaxState=="\\(") texCode+=txt[i];
		else htmlSec.innerHTML=htmlCode+=txt[i];
	    }
	}
	scrollDown(shell);
    });

      shell.on("reset", function() {
	  inputDiv.textContent="";
	  inputSent=false;
    });
  };

  return {
    create,
    interrupt,
  };
};
