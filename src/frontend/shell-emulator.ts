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
declare const katex;
declare const Prism;
declare const M2symbols;

function dehtml(s) {
    s=s.replace(/&amp;/g,"&");
    s=s.replace(/&lt;/g,"<");
    s=s.replace(/&gt;/g,">");
    s=s.replace(/&quot;/g,"\"");
    return s;
}

/* caret/selection issues:
- in chrome, anchor*=base* = start, extent*=focus* = end. *node = the DOM element itself
- in firefox, anchor* = start, focus* = end.              *node = the text node inside the dom element
*/

function addToEl(el,pos,s) { // insert into a pure text element
    var msg=el.textContent;
    el.textContent = msg.substring(0,pos)+s+msg.substring(pos,msg.length);
    // put the caret where it should be
    el.focus();
    var sel=window.getSelection();
    sel.collapse(el.firstChild,pos+s.length); // remember inputEl can only contain one (text) node. or should we relax this? anyway at this stage we rewrote its textContent
}

function placeCaretAtEnd(el,flag?) { // flag means only do it if not already in input. returns position
    if ((!flag)||(document.activeElement!=el))
    {
	el.focus();
/*	var range = document.createRange();
	range.selectNodeContents(inputEl);
	range.collapse(false);
	var sel = window.getSelection();
	sel.removeAllRanges();
	sel.addRange(range);
*/
	var sel = window.getSelection();
	if (el.childNodes.length>0)
	{
	    var node = el.lastChild;
	    var len = node.textContent.length;
	    sel.collapse(node,len);
	    return len;
	}
	else return 0;
    }
    else return window.getSelection().focusOffset; // correct only if one text node TODO think about this
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

module.exports = function() {
  const create = function(shell, editorArea, socket: Socket) {
      const editor = editorArea;
      var cmdHistory: any = []; // History of commands for shell-like arrow navigation
      cmdHistory.index = 0;
      var inputBack=0; // number of lines of input that M2 has regurgitated so far
      var inputEl; // note that inputEl should always have *one text node*
      var autoComplete=null;
      // mathJax related stuff
      var mathJaxState = "<!--txt-->"; // txt = normal output, html = ordinary html
      var htmlComment= /(<!--txt-->|<!--inp-->|<!--con-->|<!--html-->|\\\(|\\\))/; // the hope is, these sequences are never used in M2
      var htmlCode=""; // saves the current html code to avoid rewriting
      var texCode=""; // saves the current TeX code
      var htmlSec; // html element of current html code
      var inputPossibleEnd = false; // TODO explain

      
      inputEl = document.createElement("span");
      inputEl.contentEditable = true; // inputEl.setAttribute("contentEditable",true);
      inputEl.spellcheck = false; // inputEl.setAttribute("spellcheck",false);
      inputEl.autocapitalize = false; // inputEl.setAttribute("autocapitalize","off");
      inputEl.autocorrect = false;
      inputEl.autocomplete = false;
      inputEl.classList.add("M2CurrentInput");
      shell[0].appendChild(inputEl);
      inputEl.focus();

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
		      inputEl.textContent=cmdHistory.current;
		  } else {
		      inputEl.textContent=cmdHistory[cmdHistory.index];
		  }
	      }
	  }
	  else if ((e.keyCode === keys.arrowUp) && (cmdHistory.index > 0)) { // UP
	      if (cmdHistory.index === cmdHistory.length) {
		  cmdHistory.current = inputEl.textContent;
	      }
	      cmdHistory.index--;
	      inputEl.textContent=cmdHistory[cmdHistory.index];
	  }
	  placeCaretAtEnd(inputEl);
    scrollDown(shell);
      };
      
      const codeInputAction = function(e) {
	  // will only trigger if selection is empty
	  if (window.getSelection().isCollapsed)
	      inputEl.textContent = this.textContent;
	  placeCaretAtEnd(inputEl);
	  scrollDown(shell);
      };

      function removeAutoComplete(flag) { // flag means insert the selection or not
	  if (autoComplete)
	  {
	      var pos=inputEl.textContent.length;
	      inputEl.textContent+=autoComplete.lastChild.textContent;
	      if (flag) {
		  var el=document.getElementById("autocomplete-selection");
		  if (el)
		      addToEl(inputEl,pos,el.textContent+" ");
		  else
		      addToEl(inputEl,pos,autoComplete.word);
	      }
	      else addToEl(inputEl,pos,autoComplete.word);
	      shell[0].removeChild(autoComplete); autoComplete=null;
	  }
      }

      
      shell.on("postMessage", function(e,msg,flag1,flag2) { // send input, adding \n if necessary
	  removeAutoComplete(false); // remove autocomplete menu if open
	  if (msg.length>0) {
	      shell.trigger("addToHistory",msg);
	      if (msg[msg.length-1] != "\n") msg+="\n";
	      inputEl.textContent=msg;	      
	      if (flag1&&((<any>document.getElementById("editorToggle")).checked)) shell.trigger("addToEditor",msg);
	      if (flag2) placeCaretAtEnd(inputEl);
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

      shell.bind('paste',function(e) { placeCaretAtEnd(inputEl,true); });

      shell.click(function(e) { if (window.getSelection().isCollapsed) placeCaretAtEnd(inputEl,true) });

    // If something is entered, change to end of textarea, if at wrong position.
      shell.keydown(function(e: KeyboardEvent) {
	  removeAutoComplete(false); // remove autocomplete menu if open
      if (e.keyCode === keys.enter) {
	  const msg=inputEl.textContent;
	  shell.trigger("postMessage",[msg,true,true]);
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
      var pos = placeCaretAtEnd(inputEl,true);

	  /*
      if (e.ctrlKey && e.keyCode === keys.cKey) {
        interrupt(socket);
      }
	  */ // for now CTRL-C is usual "copy"

	  // auto-completion code
	  if (e.keyCode === keys.tab) {
	      var msg = inputEl.textContent;
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
			  addToEl(inputEl,pos,M2symbols[j].substring(word.length,M2symbols[j].length)+" ");
		      }
		      else { // more interesting: several solutions
			  // obvious solution would've been datalist + input; sadly, the events generated by the input are 200% erratic, so can't use
			  autoComplete = document.createElement("span");
			  autoComplete.classList.add("autocomplete");
			  autoComplete.word=word;
			  var tabMenu = document.createElement("ul");
			  tabMenu.setAttribute("tabindex","0"); // hack
			  for (var l=j; l<k; l++)
			  {
			      var opt = document.createElement("li");
			      opt.textContent=M2symbols[l];
			      if (l==j) opt.id="autocomplete-selection";
			      opt.addEventListener("mouseover", function() {
				  var el=document.getElementById("autocomplete-selection");
				  if (el) el.removeAttribute("id");
				  this.id="autocomplete-selection";
			      });
			      tabMenu.appendChild(opt);
			  }
			  autoComplete.appendChild(tabMenu);
			  autoComplete.appendChild(document.createTextNode(inputEl.textContent.substring(pos,inputEl.textContent.length)));
			  inputEl.textContent=inputEl.textContent.substring(0,i+1);
			  shell[0].appendChild(autoComplete);
			  tabMenu.addEventListener("click", function(e) {
				  removeAutoComplete(true);
				  e.preventDefault();
				  e.stopPropagation();
				  return false;			      
			  });
			  tabMenu.addEventListener("keydown", function(e) {
			      if (e.keyCode === keys.enter) {
				  removeAutoComplete(true);
				  e.preventDefault();
				  e.stopPropagation();
				  return false; // probably overkill
			      }
			      if (e.keyCode === keys.arrowDown) {
				  var el=document.getElementById("autocomplete-selection");
				  if (el) {
				      if (el!=this.lastElementChild) {
					  el.id="";
					  el.nextElementSibling.id="autocomplete-selection";
				      }
				  } else {
				      this.firstElementChild.id="autocomplete-selection";
				  }
				  e.preventDefault();
				  e.stopPropagation();
				  return false; // probably overkill
			      }
			      if (e.keyCode === keys.arrowUp) {
				  var el=document.getElementById("autocomplete-selection");
				  if (el) {
				      if (el!=this.firstElementChild) {
					  el.id="";
					  el.previousElementSibling.id="autocomplete-selection";
				      }
				  } else {
				      this.lastElementChild.id="autocomplete-selection";
				  }
				  e.preventDefault();
				  e.stopPropagation();
				  return false; // probably overkill
			      }
			  });
			  tabMenu.focus();
//			  scrollDown(shell); // not to the bottom: input should still be visible
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
      msg = msg.replace(/\r\n/g, "\n"); // that's right...
	//      msg = msg.replace(/\r/g, "\n");
	msg = msg.replace(/\r./g, ""); // fix for the annoying mess of the output, hopefully

	if (inputBack<cmdHistory.length)
	    inputEl.textContent=""; // input will eventually be regurgitated by M2
	
	if (!htmlSec) { // for very first time
	    htmlSec=document.createElement('span');
	    shell[0].insertBefore(htmlSec,inputEl);
	}
	console.log("msg='"+msg+"'");
      var txt=msg.split(htmlComment);
      for (var i=0; i<txt.length; i+=2)
	{
	    var oldState=mathJaxState;
	    if (i>0) {
		mathJaxState=txt[i-1];
		if (mathJaxState=="<!--html-->") { // html section beginning
		    htmlSec=document.createElement('span');
		    htmlSec.style.whiteSpace="initial"; // TODO define a class
		    shell[0].insertBefore(htmlSec,inputEl);
		    htmlCode=""; // need to record because html tags may get broken
		}
		else if (mathJaxState=="\\(") { // tex section beginning. should always be in a html section
		    texCode="";
		}
		else if (mathJaxState=="\\)") { // tex section ending
		    texCode=dehtml(texCode);
		    htmlSec.innerHTML=htmlCode+=katex.renderToString(texCode);
		}
		else if (mathJaxState=="<!--inp-->") { // input section: a bit special (ends at first \n)
		    htmlSec=document.createElement('span');
		    htmlSec.classList.add("M2PastInput");
		    shell[0].insertBefore(htmlSec,inputEl);
		    // TODO: if necessary (shouldn't happen) we do some surgery
		}
		else if (mathJaxState=="<!--con-->") { // continuation of input section
		    // have to navigate around the fact that chrome refuses to focus on empty text node *at start of line*
		    // current solution: leave the blank
		    // TODO: make it prettier so the bubble is rectangular
		    // TODO: if necessary (shouldn't happen) we do some surgery
		}
		else { // ordinary text (error messages, prompts, etc)
		    htmlSec=document.createElement('span');
		    shell[0].insertBefore(htmlSec,inputEl);
		}
	    }
	    if (txt[i].length>0) {
		if ((mathJaxState=="<!--inp-->")||(mathJaxState=="<!--con-->")) {
		    var ii=txt[i].indexOf("\n");
		    if (ii>=0) {
			mathJaxState="<!--inpend-->";
			if (ii<txt[i].length-1) {
			    // should never happen but still, should take care of it
			    txt=txt.splice(i,-1,txt[i].substring(0,ii+1),"<!--txt-->",txt[i].substring(ii+1,txt[i].length));
			}
		    }
		}
			


		if ((oldState=="<!--inpend-->")&&((i==0)||(mathJaxState!="<!--con-->"))) {
		    // an input section ended
		    // remove the \n and highlight
		    htmlSec.innerHTML=Prism.highlight(htmlSec.textContent.substring(0,htmlSec.textContent.length-1),Prism.languages.macaulay2);
		    htmlSec.addEventListener("click",codeInputAction);
		    // new section
		    htmlSec=document.createElement('span');
		    shell[0].insertBefore(htmlSec,inputEl);
		    txt[i]="\n"+txt[i]; // and put it back
		    mathJaxState="<!--txt-->";
		}
		
		if (mathJaxState=="\\(") texCode+=txt[i];
		else if (mathJaxState=="<!--html-->") htmlSec.innerHTML=htmlCode+=txt[i];
		else htmlSec.textContent+=txt[i];
	    }
	}
	scrollDown(shell);
    });

      shell.on("reset", function() {
	  console.log("Reset");
	  inputEl.textContent="";
	  removeAutoComplete(false); // remove autocomplete menu if open
	  inputBack=cmdHistory.length;
	  mathJaxState = "<!--txt-->";
	  inputPossibleEnd = false;
	  htmlSec=null;
	  shell[0].insertBefore(document.createElement("br"),inputEl);
    });
  };

  return {
    create,
    interrupt,
  };
};
