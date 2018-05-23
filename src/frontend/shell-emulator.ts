// initialize with ID (string) of field that should act like a shell,
//  i.e., command history, taking input and replacing it with output from server

// shell functions for
// * interrupt
/* eslint-env browser */
/* eslint "max-len": "off" */
const keys = {
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
    escape: 27,
  ctrlc: "\x03",
};

import {Socket} from "./mathProgram";
import * as tags from "./tags";

const unicodeBell = "\u0007";
declare const katex;
declare const Prism;
declare const M2symbols;

function dehtml(s) { // these are all the substitutions performed by M2
    s=s.replace(/&bsol;/g,"\\");
    s=s.replace(/&lt;/g,"<");
    s=s.replace(/&gt;/g,">");
    s=s.replace(/&quot;/g,"\"");
    s=s.replace(/&amp;/g,"&"); // do this one last
    return s;
}

/* caret/selection issues:
- in chrome, anchor*=base* = start, extent*=focus* = end. *node = the DOM element itself
- in firefox, anchor* = start, focus* = end.              *node = the text node inside the dom element
*/

function scrollDownLeft(element) {
    element.scrollTop(element[0].scrollHeight);
    element.scrollLeft(0);
};

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
      var inputSpan; // the input HTML element at the bottom of the shell. note that inputSpan should always have *one text node*
      var autoComplete=null; // autocomplete HTML element (when tab is pressed)
      // mathJax/katex related stuff
      var mathJaxState = tags.mathJaxTextTag;
      var mathJaxTags = new RegExp("(" + tags.mathJaxTagsArray.join("|") + "|\\\\\\(|\\\\\\))"); // ridiculous # of \
      var htmlCode=""; // saves the current html code to avoid rewriting
      var texCode=""; // saves the current TeX code
      var jsCode=""; // saves the current script
      var htmlSec; // html element of current output section
      var preTexState;
      var preJsState;

      const inputElCreate = function() {
	  // (re)create the input area
	  if (inputSpan) inputSpan.parentElement.removeChild(inputSpan);
	  inputSpan = document.createElement("span");
	  inputSpan.contentEditable = true; // inputSpan.setAttribute("contentEditable",true);
	  inputSpan.spellcheck = false; // sadly this or any of the following attributes are not recognized in contenteditable :(
	  inputSpan.autocapitalize = "off";
	  inputSpan.autocorrect = "off";
	  inputSpan.autocomplete = "off";
	  inputSpan.classList.add("M2Input");
	  inputSpan.classList.add("M2CurrentInput");
	  shell[0].appendChild(inputSpan);
	  inputSpan.focus();
      }

      inputElCreate();

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
		      inputSpan.textContent=cmdHistory.current;
		  } else {
		      inputSpan.textContent=cmdHistory[cmdHistory.index];
		  }
	      }
	  }
	  else if ((e.keyCode === keys.arrowUp) && (cmdHistory.index > 0)) { // UP
	      if (cmdHistory.index === cmdHistory.length) {
		  cmdHistory.current = inputSpan.textContent;
	      }
	      cmdHistory.index--;
	      inputSpan.textContent=cmdHistory[cmdHistory.index];
	  }
	  placeCaretAtEnd(inputSpan);
    scrollDownLeft(shell);
      };
      
      const codeInputAction = function(e) {
	  // will only trigger if selection is empty
	  if (window.getSelection().isCollapsed)
	  {
	      inputSpan.textContent = this.textContent;
	      placeCaretAtEnd(inputSpan);
	      scrollDownLeft(shell);
	  }
      };

      const toggleOutput = function(e) {
	  if (window.getSelection().isCollapsed&&(e.target.tagName!="A"))
	  {
	      if (this.classList.contains("M2Html-wrapped")) {
		  this.classList.remove("M2Html-wrapped");
		  var ph = document.createElement("span");
		  ph.classList.add("M2-hidden");
		  var thisel=this; // because of closure, the element will be saved
		  ph.addEventListener("click", function(e) { // so we can restore it later
		      shell[0].insertBefore(thisel,ph);
		      shell[0].removeChild(ph);
		      e.stopPropagation();
		      return false;
		  } );
		  ph.addEventListener("mousedown", function(e) { if (e.detail>1) e.preventDefault(); });
		  shell[0].insertBefore(ph,this);
		  shell[0].removeChild(this);
	      }
	      else this.classList.add("M2Html-wrapped");
	      e.stopPropagation();
	      return false;
	  }
      };

      function removeAutoComplete(flag) { // flag means insert the selection or not
	  if (autoComplete)
	  {
	      var pos=inputSpan.textContent.length;
	      inputSpan.textContent+=autoComplete.lastChild.textContent;
	      var el;
	      if (flag&&(el=document.getElementById("autocomplete-selection")))
		  addToEl(inputSpan,pos,el.textContent+" ");
	      else
		  addToEl(inputSpan,pos,autoComplete.word);
	      autoComplete.parentElement.removeChild(autoComplete); autoComplete=null;
	  }
      }

      const symbols = {
	  0x3B1:"alpha",0x3B2:"beta",0x3B3:"gamma",0x3B4:"delta",0x3B5:"epsilon",0x3B6:"zeta",0x3B7:"eta",0x3B8:"theta",0x3B9:"iota",0x3BA:"kappa",0x3BB:"lambda",0x3BC:"mu",0x3BD:"nu",0x3BE:"xi",0x3BF:"omicron",0x3C0:"pi",0x3C1:"rho",0x3C3:"sigma",0x3C4:"tau",0x3C5:"upsilon",0x3C6:"phi",0x3C7:"chi",0x3C8:"psi",0x3C9:"omega",
	  0x391:"Alpha",0x392:"Beta",0x393:"Gamma",0x394:"Delta",0x395:"Epsilon",0x396:"Zeta",0x397:"Eta",0x398:"Theta",0x399:"Iota",0x39A:"Kappa",0x39B:"Lambda",0x39C:"Mu",0x39D:"Nu",0x39E:"Xi",0x39F:"Omicron",0x3A0:"Pi",0x3A1:"Rho",0x3A3:"Sigma",0x3A4:"Tau",0x3A5:"Upsilon",0x3A6:"Phi",0x3A7:"Chi",0x3A8:"Psi",0x3A9:"Omega",
	  0x2102:"CC",0x210D:"HH",0x2115:"NN",0x2119:"PP",0x211A:"QQ",0x211D:"RR",0x2124:"ZZ",
	  0x0A:"\n"
      }; // partial support for unicode symbols

      shell.on("postMessage", function(e,msg,flag1,flag2) { // send input, adding \n if necessary
	  removeAutoComplete(false); // remove autocomplete menu if open
	  if (msg.length>0) {
	      shell.trigger("addToHistory",msg);
	      inputSpan.textContent=msg+"\u21B5"; // insert a cute return symbol; will be there only briefly
	      if (flag2) placeCaretAtEnd(inputSpan);
	      // sanitize input
	      var clean = "";
	      for (var i=0; i<msg.length; i++) {
		  var c = msg.charCodeAt(i);
		  if (((c>=32)&&(c<128))||(symbols[c])) clean+=msg.charAt(i); // a bit too restrictive?
	      }
	      if (clean[clean.length-1] != "\n") clean+="\n";
	      if (flag1&&((<any>document.getElementById("editorToggle")).checked)) shell.trigger("addToEditor",clean);
	      postRawMessage(clean, socket);
	  }
      });

    shell.on("addToEditor", function(e, msg) { // add command to editor area
      if (typeof msg !== "undefined") {
        if (editor !== undefined) {
	    editor[0].appendChild(document.createTextNode(msg));
          scrollDownLeft(editor);
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

      shell.bind('paste',function(e) {
	  placeCaretAtEnd(inputSpan,true);
      });

      shell.click(function(e) { if (window.getSelection().isCollapsed) placeCaretAtEnd(inputSpan,true) });

    // If something is entered, change to end of textarea, if at wrong position.
      shell.keydown(function(e: KeyboardEvent) {
	  removeAutoComplete(false); // remove autocomplete menu if open
      if (e.keyCode === keys.enter) {
	  const msg=inputSpan.textContent;
	  shell.trigger("postMessage",[msg,true,true]);
	  scrollDownLeft(shell);
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
      var pos = placeCaretAtEnd(inputSpan,true);

	  if (e.keyCode === keys.escape) {
	      var esc = inputSpan.textContent.indexOf("\u250B");
	      if (esc<0)
		  addToEl(inputSpan,pos,"\u250B");
	      else {
		  var s;
		  if (esc<pos) {
		      s = inputSpan.textContent.substring(esc+1,pos);
		      inputSpan.textContent=inputSpan.textContent.substring(0,esc)+inputSpan.textContent.substring(pos,inputSpan.textContent.length);
		      pos=esc;
		  } else {
		      s = inputSpan.textContent.substring(pos,esc);
		      inputSpan.textContent=inputSpan.textContent.substring(0,pos)+inputSpan.textContent.substring(esc+1,inputSpan.textContent.length);
		  }
		  var sss="";
		  if (s.length>0)
		      for (var ss in symbols) {
			  if (symbols[ss].startsWith(s)) {
			      sss=String.fromCharCode(+ss);
			      break;
			  }
		      }
		  addToEl(inputSpan,pos,sss);
	      }
	      return false;
	  }
	  
	  
	  /*
      if (e.ctrlKey && e.keyCode === keys.cKey) {
        interrupt(socket);
      }
	  */ // for now CTRL-C is usual "copy"

	  // auto-completion code
	  if (e.keyCode === keys.tab) {
	      var msg = inputSpan.textContent;
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
			  addToEl(inputSpan,pos,M2symbols[j].substring(word.length,M2symbols[j].length)+" ");
		      }
		      else { // more interesting: several solutions
			  // obvious implementation would've been datalist + input; sadly, the events generated by the input are 200% erratic, so can't use
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
			  autoComplete.appendChild(document.createTextNode(inputSpan.textContent.substring(pos,inputSpan.textContent.length)));
			  inputSpan.textContent=inputSpan.textContent.substring(0,i+1);
			  inputSpan.parentElement.appendChild(autoComplete);
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
		      }
		}
	    }
	    e.preventDefault();
	}
      });

      const createSpan = function(className?) {
	  var anc;
	  if (htmlSec) anc = htmlSec.parentElement; else anc = shell[0];
	  if (inputSpan.parentElement == htmlSec) { // if we moved the input because of multi-line
	      var flag = document.activeElement == inputSpan; // (should only happen exceptionally that we end up here)
	      anc.appendChild(inputSpan); // move it back
	      if (flag) inputSpan.focus();
	  }
	  htmlSec=document.createElement('span');
	  if (className) {
	      htmlSec.className=className;
	      if (className.indexOf("M2HtmlOutput")>=0) {
		  htmlSec.addEventListener("click",toggleOutput);
		  htmlSec.addEventListener("mousedown", function(e) {
		      if (e.detail>1) e.preventDefault();
		  });
	      }
	      if (className.indexOf("M2Html")>=0) htmlCode=""; // need to keep track of innerHTML because html tags may get broken
	  }
	  anc.insertBefore(htmlSec,inputSpan);
      }

    shell.on("onmessage", function(e, msgDirty) {
      if (msgDirty === unicodeBell) {
        return;
      }
        // If we get a 'Session resumed.' message, we check whether it is
        // relevant.
	// seems a bit brutal. what if there's more stuff in there? TODO
	/*
      if (msgDirty.indexOf("Session resumed.") > -1) {
        if (mathProgramOutput.length > 0) { 
          return;
        }
      }
*/

      let msg: string = msgDirty.replace(/\u0007/g, ""); // remove bells -- typically produced by tab characters
	msg = msg.replace(/\r\u001B[^\r]*\r/g, ""); // fix for the annoying mess of the output, hopefully
	msg = msg.replace(/\r\n/g, "\n"); // that's right...
	msg = msg.replace(/\r./g, ""); // fix for the annoying mess of the output, hopefully
	msg = msg.replace(/file:\/\/\/[^"']+\/share\/doc\/Macaulay2/g,"http://www2.Macaulay2.com/Macaulay2/doc/Macaulay2-1.11/share/doc/Macaulay2");
      if (!htmlSec) createSpan("M2Text"); // for very first time
      //	console.log("state='"+mathJaxState+"',msg='"+msg+"'");

	var ii:number = inputSpan.textContent.lastIndexOf("\u21B5");
	if (ii>=0) inputSpan.textContent=inputSpan.textContent.substring(ii+1,inputSpan.textContent.length); // erase past sent input

	var txt=msg.split(mathJaxTags);
      for (var i=0; i<txt.length; i+=2)
	{
//	    console.log("state='"+mathJaxState+"|"+txt[i-1]+"',txt='"+txt[i]+"'");
	    // if we are at the end of an input section
	    if ((mathJaxState==tags.mathJaxInputEndTag)&&(((i==0)&&(txt[i].length>0))||((i>0)&&(txt[i-1]!=tags.mathJaxInputContdTag)))) {
		var flag = document.activeElement == inputSpan;
		htmlSec.parentElement.appendChild(inputSpan); // move back input element to outside htmlSec
		htmlSec.parentElement.insertBefore(document.createElement("br"),inputSpan);
		if (flag) inputSpan.focus();
		// highlight
		htmlSec.innerHTML=Prism.highlight(htmlSec.textContent,Prism.languages.macaulay2);
		htmlSec.classList.add("M2PastInput");
		htmlSec.addEventListener("click",codeInputAction);
		htmlSec.addEventListener("mousedown", function(e) { if (e.detail>1) e.preventDefault(); });
		if (i==0) { // manually start new section
		    mathJaxState=tags.mathJaxTextTag;
		    createSpan("M2Text");
		}
	    }
	    if (i>0) {
		var oldState = mathJaxState;
		mathJaxState=txt[i-1];
		if (mathJaxState==tags.mathJaxHtmlTag) { // html section beginning
		    createSpan("M2Html");
		}
		else if (mathJaxState==tags.mathJaxOutputTag) { // pretty much the same
		    createSpan("M2Html M2HtmlOutput");
		}
		else if (mathJaxState=="\\(") { // tex section beginning. should always be in a html section
		    if ((oldState==tags.mathJaxHtmlTag)||(oldState==tags.mathJaxOutputTag)) {
			preTexState=oldState;
			texCode="";
		    }
		    else {
			txt[i]=mathJaxState+txt[i]; // if not, treat as ordinary text
			mathJaxState=oldState;
		    }
		}
		else if (mathJaxState=="\\)") { // tex section ending
		    if (oldState=="\\(") { // we're not allowing for complicated nested things yet. TODO???
			texCode=dehtml(texCode); // needed for MathJax compatibility
			htmlSec.innerHTML=htmlCode+=katex.renderToString(texCode);
			//htmlSec.innerHTML=htmlCode+=katex.renderToString(texCode,  {macros: {"\\frac" : "\\left( #1 \\middle)\\middle/\\middle( #2 \\right)"}});
			mathJaxState=preTexState;
		    }
		    else {
			txt[i]=mathJaxState+txt[i]; // if not, treat as ordinary text
			mathJaxState=oldState;
		    }
		}
		else if (mathJaxState==tags.mathJaxScriptTag) { // script section beginning
			preJsState=oldState;
			jsCode="";
		}
		else if (mathJaxState==tags.mathJaxEndScriptTag) { // script section ending
		    if (oldState==tags.mathJaxScriptTag) {
			var scr = document.createElement('script');
			scr.text = dehtml(jsCode); // TEMP? need to think carefully. or should it depend whether we're inside a \( or not?
			document.head.appendChild(scr);
			mathJaxState=preJsState;
		    }
		    else {
			txt[i]=mathJaxState+txt[i]; // if not, treat as ordinary text
			mathJaxState=oldState;
		    }
		}
		else if (mathJaxState==tags.mathJaxInputTag) { // input section: a bit special (ends at first \n)
		    createSpan("M2Input");
		    var flag = document.activeElement == inputSpan;
		    htmlSec.appendChild(inputSpan); // !!! we move the input inside the current span to get proper indentation !!! potentially dangerous (can't rewrite the textContent any more)
		    if (flag) inputSpan.focus();
		}
		else if (mathJaxState==tags.mathJaxInputContdTag) { // continuation of input section
		    // nothing to do
		}
		else { // ordinary text (error messages, prompts, etc)
		    createSpan("M2Text");
		}
	    }
	    if (txt[i].length>0) {
		// for next round, check if we're nearing the end of an input section
		if ((mathJaxState==tags.mathJaxInputTag)||(mathJaxState==tags.mathJaxInputContdTag)) {
		    var ii=txt[i].indexOf("\n");
		    if (ii>=0) {
			mathJaxState=tags.mathJaxInputEndTag;
			if (ii<txt[i].length-1) {
			    // need to do some surgery: what's after the \n is some [text tag] stuff
			    txt.splice(i,1,txt[i].substring(0,ii+1),tags.mathJaxTextTag,txt[i].substring(ii+1,txt[i].length));
			}
		    }
		}

		if (mathJaxState=="\\(") texCode+=txt[i];
		else if (mathJaxState==tags.mathJaxScriptTag) jsCode+=txt[i];
		else if ((mathJaxState==tags.mathJaxHtmlTag)||(mathJaxState==tags.mathJaxOutputTag)) htmlSec.innerHTML=htmlCode+=txt[i];
		else // all other states are raw text
		    if (inputSpan.parentElement == htmlSec)
			htmlSec.insertBefore(document.createTextNode(txt[i]),inputSpan); // don't rewrite htmlSec.textContent+=txt[i] in case of input
		    else
			htmlSec.textContent+=txt[i];
	    }
	}
	scrollDownLeft(shell);
    });

      shell.on("reset", function() {
	  console.log("Reset");
	  removeAutoComplete(false); // remove autocomplete menu if open
	  inputElCreate(); // recreate the input area
	  shell[0].insertBefore(document.createElement("br"),inputSpan);
	  mathJaxState = tags.mathJaxTextTag;
	  htmlSec=null;
    });
  };

  return {
    create,
    interrupt,
  };
};
