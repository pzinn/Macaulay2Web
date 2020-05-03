// initialize with ID (string) of field that should act like a shell,
//  i.e., command history, taking input and replacing it with output from server

// shell functions for
// * interrupt
/* eslint-env browser */
/* eslint "max-len": "off" */

import {Socket} from "./mathProgram";

const webAppTags = require("../frontend/tags");
const tools = require("./htmlTools");

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

const Shell = function(shell: HTMLElement, socket: Socket, editor: HTMLElement, editorToggle?: HTMLInputElement) {
    // Shell is an old-style javascript oop constructor
    // we're using arguments as private variables, cf
    // https://stackoverflow.com/questions/18099129/javascript-using-arguments-for-closure-bad-or-good
    const obj = this; // for nested functions with their own 'this'. or one could use bind but simpler this way
    var htmlSec; // the current place in shell where new stuff gets written
    var inputSpan; // the input HTML element at the bottom of the shell. note that inputSpan should always have *one text node*
    var cmdHistory: any = []; // History of commands for shell-like arrow navigation
    cmdHistory.index = 0;
    var autoComplete=null; // autocomplete HTML element (when tab is pressed)
    var autoCompleteSelection=null; // the currently selected element in the autocomplete list
    // mathJax/katex related stuff
    const webAppTagsRegExp = new RegExp("(" + Object.values(webAppTags).join("|") + ")");
    // input is a bit messy...
    var inputEndFlag = false;
    var procInputSpan=null; // temporary span containing currently processed input
    var inputSpanParentElement=[]; // temporary link(s) to parent element when input span moved out of it

    const createInputEl = function() {
	// (re)create the input area
	if (inputSpan) inputSpan.remove(); // parentElement.removeChild(inputSpan);
	inputSpan = document.createElement("span");
	//inputSpan = document.createElement("input"); // interesting idea but creates tons of problems
	inputSpan.contentEditable = true; // inputSpan.setAttribute("contentEditable",true);
	inputSpan.spellcheck = false; // sadly this or any of the following attributes are not recognized in contenteditable :(
	inputSpan.autocapitalize = "off";
	inputSpan.autocorrect = "off";
	inputSpan.autocomplete = "off";
	inputSpan.classList.add("M2Input");
	inputSpan.classList.add("M2CurrentInput");
	shell.appendChild(inputSpan);
	inputSpan.focus();
	htmlSec=shell;
	inputSpanParentElement=[];
    }

    createInputEl();

      const codeInputAction = function() {
	  // will only trigger if selection is empty
	  if (window.getSelection().isCollapsed)
	  {
	      var str = this.textContent;
	      if (str[str.length-1] == "\n") str=str.substring(0,str.length-1); // cleaner this way
	      inputSpan.textContent = str;
	      tools.scrollDown(shell);
	      tools.placeCaretAtEnd(inputSpan); // TEMP doesnt work for scrolling
	  }
      };

      const toggleOutput = function() {
	  if (window.getSelection().isCollapsed)
	  {
	      if (this.classList.contains("M2Html-wrapped")) {
		  this.classList.remove("M2Html-wrapped");
		  var thisel=this; // because of closure, the element will be saved
		  var anc = thisel.parentElement;
		  var ph = document.createElement("span");
		  ph.classList.add("M2-hidden");
		  ph.addEventListener("click", function(e) { // so we can restore it later
		      anc.insertBefore(thisel,ph);
		      anc.removeChild(ph);
		      e.stopPropagation();
		      return;
		  } );
		  ph.addEventListener("mousedown", function(e) { if (e.detail>1) e.preventDefault(); });
		  anc.insertBefore(ph,this);
		  anc.removeChild(this);
	      }
	      else this.classList.add("M2Html-wrapped");
	  }
      };

      const removeAutoComplete = function(flag) { // flag means insert the selection or not
	  if (autoComplete)
	  {
	      var pos=inputSpan.textContent.length;
	      inputSpan.textContent+=autoComplete.lastChild.textContent;
	      var el;
	      if (flag&&autoCompleteSelection)
		  tools.addToElement(inputSpan,pos,autoCompleteSelection.textContent+" ");
	      else
		  tools.addToElement(inputSpan,pos,autoComplete.dataset.word);
	      autoComplete.remove(); autoComplete=autoCompleteSelection=null;
	  }
      }

    const removeDelimiterHighlight = function() {
	inputSpan.removeAttribute("data-highlight");
	inputSpan.removeAttribute("data-highlight-error");
    }

      const symbols = {
	  0x391:"Alpha",0x392:"Beta",0x393:"Gamma",0x394:"Delta",0x395:"Epsilon",0x396:"Zeta",0x397:"Eta",0x398:"Theta",0x399:"Iota",0x39a:"Kappa",0x39b:"Lambda",0x39c:"Mu",0x39d:"Nu",0x39e:"Xi",0x39f:"Omicron",0x3a0:"Pi",0x3a1:"Rho",0x3a3:"Sigma",0x3a4:"Tau",0x3a5:"Upsilon",0x3a6:"Phi",0x3a7:"Chi",0x3a8:"Psi",0x3a9:"Omega",0x3b1:"alpha",0x3b2:"beta",0x3b3:"gamma",0x3b4:"delta",0x3f5:"epsilon",0x3b6:"zeta",0x3b7:"eta",0x3b8:"theta",0x3b9:"iota",0x3ba:"kappa",0x3bb:"lambda",0x3bc:"mu",0x3bd:"nu",0x3be:"xi",0x3bf:"omicron",0x3c0:"pi",0x3c1:"rho",0x3c3:"sigma",0x3c4:"tau",0x3c5:"upsilon",0x3d5:"phi",0x3c7:"chi",0x3c8:"psi",0x3c9:"omega",0x3b5:"varepsilon",0x3d1:"vartheta",0x3d6:"varpi",0x3f1:"varrho",0x3c2:"varsigma",0x3c6:"varphi",
	  0x2135:"aleph",0x2136:"beth",0x2138:"daleth",0x2137:"gimel",
	  0x210f:"hbar",0x2207:"nabla",0x2113:"ell",0x2118:"wp",0x211c:"Re",0x2111:"Im",
	  0x2102:"CC",0x210D:"HH",0x2115:"NN",0x2119:"PP",0x211A:"QQ",0x211D:"RR",0x2124:"ZZ",
	  0x221e:"infty",
	  0x0A:"\n"
      }; // partial support for unicode symbols

    const returnSymbol="\u21B5";

    const postRawMessage = function(msg: string) {
	socket.emit("input", msg);
    };

    const sanitizeInput = function(msg: string) {
	  // sanitize input
	  var clean = "";
	  for (var i=0; i<msg.length; i++) {
	      var c = msg.charCodeAt(i);
	      if (((c>=32)&&(c<128))||(symbols[c])) clean+=msg.charAt(i); // a bit too restrictive?
	  }
	return clean;
    }

    obj.postMessage = function(msg,flag1,flag2) { // send input, adding \n if necessary
	removeAutoComplete(false); // remove autocomplete menu if open
	removeDelimiterHighlight();
	var clean = sanitizeInput(msg);
	  if (clean.length>0) {
	      obj.addToHistory(clean);
	      if (procInputSpan === null) { // it'd be nicer to use ::before on inputSpan but sadly caret issues... cf https://stackoverflow.com/questions/60843694/cursor-position-in-an-editable-div-with-a-before-pseudo-element
		  procInputSpan = document.createElement("span");
		  procInputSpan.classList.add("M2Input");
		  inputSpan.parentElement.insertBefore(procInputSpan,inputSpan);
	      }
	      procInputSpan.textContent+=clean+returnSymbol;
	      inputSpan.textContent="";
	      tools.scrollDownLeft(shell);
	      if (flag2) tools.placeCaret(inputSpan,0);
	      if (clean[clean.length-1] != "\n") clean+="\n";
	      if (flag1) obj.addToEditor(clean);
	      postRawMessage(clean);
	  }
      };

    obj.addToEditor = function(msg) { // add command to editor area
      if (typeof msg !== "undefined") {
        if (editor !== null) {
	    editor.appendChild(document.createTextNode(msg));
          tools.scrollDownLeft(editor);
        }
      }
    };

    obj.addToHistory = function(msg) {
	const input = msg.split("\n");
	for (var line=0; line<input.length; line++) {
        if (input[line].length > 0) {
            cmdHistory.index = cmdHistory.push(input[line]);
        }
      }
    };

    const downArrowKeyHandling = function() {
	if (cmdHistory.index < cmdHistory.length) {
	    cmdHistory.index++;
	    if (cmdHistory.index === cmdHistory.length) {
		inputSpan.textContent=cmdHistory.current;
	    } else {
		inputSpan.textContent=cmdHistory[cmdHistory.index];
	    }
	}
    };

    const upArrowKeyHandling = function() {
	if (cmdHistory.index > 0) {
	    if (cmdHistory.index === cmdHistory.length) {
		cmdHistory.current = inputSpan.textContent;
	    }
	    cmdHistory.index--;
	    inputSpan.textContent=cmdHistory[cmdHistory.index];
	}
    };

    const escapeKeyHandling = function(pos) {
	var esc = inputSpan.textContent.indexOf("\u250B");
	if (esc<0)
	    tools.addToElement(inputSpan,pos,"\u250B");
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
	    tools.addToElement(inputSpan,pos,sss);
	}
    };

    const tabKeyHandling = function(pos) {
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
		    tools.addToElement(inputSpan,pos,M2symbols[j].substring(word.length,M2symbols[j].length)+" ");
		}
		else { // more interesting: several solutions
		    // obvious implementation would've been datalist + input;
		    // sadly, the events generated by the input are 200% erratic, so can't use
		    autoComplete = document.createElement("span");
		    autoComplete.classList.add("autocomplete");
		    autoComplete.dataset.word=word;
		    var tabMenu = document.createElement("ul");
		    tabMenu.setAttribute("tabindex","0"); // hack
		    for (var l=j; l<k; l++)
		    {
			var opt = document.createElement("li");
			opt.textContent=M2symbols[l];
			opt.addEventListener("mouseover", function() {
			    var el=document.getElementById("autocomplete-selection");
			    if (el) el.removeAttribute("id");
			    this.id="autocomplete-selection";
			});
			tabMenu.appendChild(opt);
		    }
		    autoCompleteSelection=tabMenu.firstElementChild;
		    autoCompleteSelection.classList.add("autocomplete-selection");
		    autoComplete.appendChild(tabMenu);
		    autoComplete.appendChild(document.createTextNode(inputSpan.textContent.substring(pos,inputSpan.textContent.length)));
		    inputSpan.textContent=inputSpan.textContent.substring(0,i+1);
		    inputSpan.parentElement.appendChild(autoComplete);
		    tabMenu.addEventListener("click", function(e) {
			removeAutoComplete(true);
			e.preventDefault();
			e.stopPropagation();
			return;
		    });
		    tabMenu.addEventListener("keydown", function(e) {
			if (e.key === "Enter") {
			    removeAutoComplete(true);
			    e.preventDefault();
			    e.stopPropagation();
			    return;
			}
			if (e.key == "ArrowDown") {
			    if (autoCompleteSelection!=this.lastElementChild) {
				autoCompleteSelection.classList.remove("autocomplete-selection");
				autoCompleteSelection=autoCompleteSelection.nextElementSibling;
				autoCompleteSelection.classList.add("autocomplete-selection");
			    }
			    e.preventDefault();
			    e.stopPropagation();
			    return;
			}
			if (e.key == "ArrowUp") {
			    if (autoCompleteSelection!=this.firstElementChild) {
				autoCompleteSelection.classList.remove("autocomplete-selection");
				autoCompleteSelection=autoCompleteSelection.previousElementSibling;
				autoCompleteSelection.classList.add("autocomplete-selection");
			    }
			    e.preventDefault();
			    e.stopPropagation();
			    return;
			}
		    });
		    tabMenu.focus();
		}
	    }
	}
    };

    const openingDelimiters = "([{\"";
    const closingDelimiters = ")]}\"";

    // the " handling is a bit messed up

    const closingDelimiterHandling = function(pos, closing) {
	if (inputSpan.parentElement != htmlSec) return; // only happens in transitional state in which case highlighting deactivated
	if ((pos>0)&&(inputSpan.textContent[pos-1]=="\\")) return; // \) does not trigger highlighting
	const index = closingDelimiters.indexOf(closing);
	if (index<0) return;
	removeDelimiterHighlight();
	const opening = openingDelimiters[index];
	const len = htmlSec.textContent.length - inputSpan.textContent.length + pos; // eww
	const input = htmlSec.textContent.substring(0, len);
	var highlight = input.replace(/./g," "); // only newlines left
	var i,j;
	var depth = []; for (i=0; i<openingDelimiters.length; i++) depth.push( i==index ? 1 : 0 );
	i=len;
	while ((i>0)&&(depth[index]>0)) {
	    i--;
	    if ((i==0)||(input[i-1]!="\\")) {
		j=openingDelimiters.indexOf(input[i]);
		if (j>=0) {
		    if (openingDelimiters[j]==closingDelimiters[j]) {
			depth[j]=1-depth[j];
		    } else {
			depth[j]--;
			if (depth[j]<0) break;
		    }
		} else {
		    j=closingDelimiters.indexOf(input[i]);
		    if (j>=0) depth[j]++;
		}
	    }
	}
	if (depth.every( val => val == 0)) {
	    inputSpan.dataset.highlight = highlight.substring(0,i)+opening+highlight.substring(i+1)+closing;
	    setTimeout( function() { inputSpan.removeAttribute("data-highlight"); }, 1000);
	} else if (closing!=opening) { // the " could've been an opening. in doubt, abstain
	    inputSpan.dataset.highlightError = highlight+closing;
	    setTimeout( function() { inputSpan.removeAttribute("data-highlight-error"); }, 1000);
	}
    }

    const openingDelimiterHandling = function(pos, opening) {
	if (inputSpan.parentElement != htmlSec) return; // only happens in transitional state in which case highlighting deactivated
	if ((pos>0)&&(inputSpan.textContent[pos-1]=="\\")) return; // \) does not trigger highlighting
	const index = openingDelimiters.indexOf(opening);
	if (index<0) return;
	removeDelimiterHighlight();
	const closing = closingDelimiters[index];
	const len = htmlSec.textContent.length - inputSpan.textContent.length + pos; // eww
	const input = htmlSec.textContent; // we don't truncate
	var highlight = input.replace(/./g," "); // only newlines left
	var i,j;
	var depth = []; for (i=0; i<openingDelimiters.length; i++) depth.push( i==index ? 1 : 0 );
	i=len;
	while ((i<input.length-1)&&(depth[index]>0)) {
	    i++;
	    if ((i==0)||(input[i-1]!="\\")) {
		j=closingDelimiters.indexOf(input[i]);
		if (j>=0) {
		    if (openingDelimiters[j]==closingDelimiters[j]) {
			depth[j]=1-depth[j];
		    } else {
			depth[j]--;
			if (depth[j]<0) break;
		    }
		} else {
		    j=openingDelimiters.indexOf(input[i]);
		    if (j>=0) depth[j]++;
		}
	    }
	}
	if (depth.every( val => val == 0)) {
	    inputSpan.dataset.highlight = highlight.substring(0,len)+opening+highlight.substring(len+1)+closing;
	    setTimeout( function() { inputSpan.removeAttribute("data-highlight"); }, 1000);
	} // we never throw an error on an opening delimiter -- it's assumed more input is coming 
    }

    shell.onpaste = function(e) {
	tools.placeCaretAtEnd(inputSpan,true);
	inputSpan.oninput = function() {
	    inputSpan.oninput = null; // !
	    tools.sanitizeElement(inputSpan); // remove HTML tags from pasted input
	}
    };

      shell.onclick = function(e) {
	  // we're gonna do manually an ancestor search -- a bit heavy but more efficient than adding a bunch of event listeners
	  var t=e.target as HTMLElement;
	  while (t!=shell) {
	      if (t.classList.contains("M2PastInput")) { codeInputAction.call(t); return; }
	      if (t.classList.contains("M2Output")) { toggleOutput.call(t); return; }
	      t=t.parentElement;
	  }
	  if (window.getSelection().isCollapsed) tools.placeCaretAtEnd(inputSpan,true);
      };

    shell.onkeydown = function(e: KeyboardEvent) {
	removeAutoComplete(false); // remove autocomplete menu if open
	removeDelimiterHighlight();
	if (e.key == "Enter") {
	    obj.postMessage(inputSpan.textContent,editorToggle&&(editorToggle.checked),true);
	    e.preventDefault(); // no crappy <div></div> added
	    return;
	}

	if ((e.key == "ArrowDown") || (e.key == "ArrowUp")) {
            if (e.key == "ArrowDown") downArrowKeyHandling(); else upArrowKeyHandling();
	    e.preventDefault();
	    tools.scrollDown(shell);
	    tools.placeCaretAtEnd(inputSpan);
	    //
	    return;
	}

	if (e.ctrlKey || e.metaKey || e.key == "PageUp" || e.key == "PageDown") { // do not move caret on Ctrl or Command combos
	    if (e.key== "PageUp" && document.activeElement == inputSpan) inputSpan.blur();
	    // this prevents the annoying behavior at the cost of losing the caret
            return;
	}

	if (e.key == "Home") {
	    tools.scrollDownLeft(shell);
	    tools.placeCaret(inputSpan,0); // the default would sometimes use this for vertical scrolling
	    return;
	}

	if (e.key == "End") {
	    tools.scrollDown(shell);
	    tools.placeCaretAtEnd(inputSpan); // the default would sometimes use this for vertical scrolling
	    return;
	}

	tools.placeCaretAtEnd(inputSpan,true);
	var pos = window.getSelection().focusOffset;

	if (closingDelimiters.indexOf(e.key) >=0 ) closingDelimiterHandling(pos, e.key);
	else if (openingDelimiters.indexOf(e.key) >=0 ) openingDelimiterHandling(pos, e.key);
	else if (e.key == "Escape") {
	    tools.scrollDown(shell);
	    escapeKeyHandling(pos);
	    e.preventDefault();
	    return;
	}
	// auto-completion code
	else if (e.key == "Tab") {
	    tools.scrollDown(shell);
	    tabKeyHandling(pos);
	    e.preventDefault();
	    return;
	}
    };

    var rawList=[];

    const closeHtml = function() {
	var anc = htmlSec.parentElement;
	if (htmlSec.classList.contains("M2Script")) {
	    //(htmlSec as HTMLScriptElement).text = dehtml(htmlSec.dataset.jsCode); // should we dehtml? need to think carefully. or should it depend whether we're inside TeX or not?
	    (htmlSec as HTMLScriptElement).text = htmlSec.dataset.jsCode;
	    document.head.appendChild(htmlSec); // might as well move to head
	    // htmlSec.remove(); // or delete, really -- script is useless once run. except doesn't seem to work on safari
	}
	else if (htmlSec.classList.contains("M2Latex")) {
	    //htmlSec.dataset.texCode=dehtml(htmlSec.dataset.texCode); // needed for MathJax compatibility
	    try {
		htmlSec.innerHTML=katex.renderToString(htmlSec.dataset.texCode, { trust: true, strict: false } );
		// restore raw stuff
		if (htmlSec.dataset.idList) htmlSec.dataset.idList.split(" ").forEach( function(id) {
		    var el = document.getElementById("raw"+id);
		    el.style.display="contents"; // could put in css but don't want to overreach
		    el.style.fontSize="0.826446280991736em"; // to compensate for katex's 1.21 factor
		    el.innerHTML=rawList[+id];
		});
		//
//		htmlSec.dataset.saveHTML=htmlSec.innerHTML; // not needed: going to die anyway
	    }
	    catch(err) {
		htmlSec.classList.add("KatexError"); // TODO: better class for this?
		htmlSec.innerHTML=err.message;
		console.log(err.message);
	    }
	}
	if (anc.classList.contains("M2Html")) { // we need to convert to string
	    anc.innerHTML=anc.dataset.saveHTML+=htmlSec.outerHTML;
	} else {
	    htmlSec.removeAttribute("data-save-h-t-m-l");
	    if (anc.classList.contains("M2Latex")) { // should almost never occur: html inside tex
		// 18mu= 1em * mathfont size modifier, here 1.21 factor of KaTeX
		var fontSize: number = +(window.getComputedStyle(htmlSec,null).getPropertyValue("font-size").split("px",1)[0])*1.21/18;
		var baseline: number = tools.baselinePosition(htmlSec);
		anc.dataset.texCode+="\\htmlId{raw"+rawList.length+"}{\\vphantom{"
		    +"\\raisebox{"+(baseline/fontSize)+"mu}{}"
		    +"\\raisebox{"+((baseline-htmlSec.offsetHeight)/fontSize)+"mu}{}"
		    +"}\\hspace{"+(htmlSec.offsetWidth/fontSize)+"mu}" // the hspace is really just for debugging
		    +"}";
		if (!anc.dataset.idList) anc.dataset.idList=rawList.length; else anc.dataset.idList+=" "+rawList.length;
		rawList.push(htmlSec.outerHTML); // try on { (help det)#2#1#0#1#0#0 }
		/*
		anc.dataset.texCode+="{\\rawhtml{"+htmlSec.outerHTML+"}{"
		+(baseline/fontSize)+"mu}{"+((htmlSec.offsetHeight-baseline)/fontSize)+"mu}}";
		*/
	    }
	}
	htmlSec = anc;
    }

    const closeInput = function() { // need to treat input specially because no closing tag
	htmlSec.parentElement.appendChild(document.createElement("br"));
	if (inputSpanParentElement.length > 0)
	    tools.attachElement(inputSpan,inputSpanParentElement.pop()); // move back input element to outside htmlSec
	else console.log("Input error"); // should never happen but does because of annoying escape sequence garbage bug (though maybe fixed by end tag fix below)
	// highlight
	htmlSec.innerHTML=Prism.highlight(htmlSec.textContent,Prism.languages.macaulay2);
	//htmlSec.addEventListener("click",codeInputAction);
	htmlSec.classList.add("M2PastInput");
	//	  htmlSec.addEventListener("mousedown", function(e) { if (e.detail>1) e.preventDefault(); });
	closeHtml();
    }

	const createHtml = function(a, className?) {
	  var anc = htmlSec;
	  htmlSec=document.createElement(a);
	  if (className) {
	      htmlSec.className=className;
	      if (className.indexOf("M2Output")>=0) {
//		  htmlSec.addEventListener("click",toggleOutput);
		  htmlSec.addEventListener("mousedown", function(e) {
		      if (e.detail>1) e.preventDefault();
		  });
	      }
	      if (className.indexOf("M2Html")>=0) htmlSec.dataset.saveHTML=""; // need to keep track of innerHTML because html tags may get broken
	  }
	  if (inputSpan.parentElement==anc) anc.insertBefore(htmlSec,inputSpan); else anc.appendChild(htmlSec);
	}

    obj.onmessage = function(msgDirty) {
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
//	msg = msg.replace(/\r\u001B[^\r]*\r/g, ""); // fix for the annoying mess of the output, hopefully -- though sometimes still misses
//	msg = msg.replace(/\r\n/g, "\n"); // that's right...
	msg = msg.replace(/\r./g, ""); // remove the line wrapping with repeated last/first character
//	msg = msg.replace(/(?<=["'])[^"']+\/share\/doc\/Macaulay2/g,"http://www2.Macaulay2.com/Macaulay2/doc/Macaulay2-1.12/share/doc/Macaulay2"); // disabled since firefox can't deal with this regex. instead, server does a redirect

	if (procInputSpan!==null) {
	    procInputSpan.remove();
	    procInputSpan=null;
	}

	var txt=msg.split(webAppTagsRegExp);
	for (var i=0; i<txt.length; i+=2)
	{
	    // if we are at the end of an input section
	    if ((inputEndFlag)&&(((i==0)&&(txt[i].length>0))||((i>0)&&(txt[i-1]!=webAppTags.InputContd)))) {
		closeInput();
		inputEndFlag=false;
	    }
	    if (i>0) {
		var tag=txt[i-1];
		if (tag==webAppTags.End) { // end of section
		    if (htmlSec.classList.contains("M2Input")) closeInput(); // should never happen but does because of annoying escape sequence garbage bug (see also closeInput fix)
		    closeHtml();
		}
		else if (tag==webAppTags.Html) { // html section beginning
		    createHtml("span","M2Html");
		}
		else if (tag==webAppTags.Output) { // pretty much the same
		    createHtml("span","M2Html M2Output");
		}
		else if (tag==webAppTags.Tex) { // tex section beginning.
		    createHtml("span","M2Latex");
		    htmlSec.dataset.texCode="";
		}
		else if (tag==webAppTags.Script) { // script section beginning
		    createHtml("script","M2Script");
		    htmlSec.dataset.jsCode=""; // can't write directly to text because scripts can only be written once!
		}
		else if (tag==webAppTags.Input) { // input section: a bit special (ends at first \n)
		    createHtml("span","M2Input");
		    inputSpanParentElement.push(inputSpan.parentElement); // not great
		    tools.attachElement(inputSpan,htmlSec); // !!! we move the input inside the current span to get proper indentation !!!
		}
		else if (tag==webAppTags.InputContd) { // continuation of input section
		    inputEndFlag=false;
		}
		else { // ordinary text (error messages, prompts, etc)
		    createHtml("span","M2Text");
		}
	    }
	    if (txt[i].length>0) {
		var l = htmlSec.classList;
		// for next round, check if we're nearing the end of an input section
		if (l.contains("M2Input")) {
		    var ii=txt[i].indexOf("\n");
		    if (ii>=0) {
			if (ii<txt[i].length-1) {
			    // need to do some surgery
			    htmlSec.insertBefore(document.createTextNode(txt[i].substring(0,ii+1)),inputSpan);
			    txt[i]=txt[i].substring(ii+1,txt[i].length);
			    closeInput();
			    l=htmlSec.classList;
			} else inputEndFlag=true; // can't tell for sure if it's the end or not, so set a flag to remind us
		    }
		}

		if (l.contains("M2Latex")) htmlSec.dataset.texCode+=txt[i];
		else if (l.contains("M2Html")) htmlSec.innerHTML=htmlSec.dataset.saveHTML+=txt[i];
		else if (l.contains("M2Script")) htmlSec.dataset.jsCode+=txt[i];
		else // all other states are raw text -- don't rewrite htmlSec.textContent+=txt[i] in case of input
		    if (inputSpan.parentElement == htmlSec)
			htmlSec.insertBefore(document.createTextNode(txt[i]),inputSpan);
		    else
			htmlSec.appendChild(document.createTextNode(txt[i]));
	    }
	}
	tools.scrollDownLeft(shell);
    };

      obj.reset = function() {
	  console.log("Reset");
	  removeAutoComplete(false); // remove autocomplete menu if open
	  createInputEl(); // recreate the input area
	  shell.insertBefore(document.createElement("br"),inputSpan);
      };

    obj.interrupt = function() {
	removeAutoComplete(false); // remove autocomplete menu if open
	inputSpan.textContent="";
	removeDelimiterHighlight();
	postRawMessage("\x03");
    };
    };


module.exports = {
	Shell
};
