const webAppTagCodes = {
    "End":        17,      // end of section script
    "Html":       18,      // indicates what follows is HTML
    "Output":     19,      // it's html but it's output
    "Input":      20,      // it's text but it's input
    "InputContd": 28,      // text, continuation of input
    "Script":     29,      // script
    "Text":       30,      // indicates what follows is pure text; default mode
    "Tex":        31       // TeX
}
/*
const webAppTags = Object.fromEntries(Object.entries(webAppTagCodes).map(
    ([key,val]) => [key,String.fromCharCode(val)])); // node.js 12 accepts that
*/
// returns a new object with the values at each key mapped using mapFn(value)
function objectMap(object, mapFn) {
  return Object.keys(object).reduce(function(result, key) {
    result[key] = mapFn(object[key])
    return result
  }, {})
}
const webAppTags = objectMap(webAppTagCodes, String.fromCharCode);

const baselinePosition = function(el) {
    const probe = document.createElement('span');
    probe.appendChild(document.createTextNode('X')); probe.style.fontSize = '0'; probe.style.visibility = 'hidden';
    el.parentElement.insertBefore(probe,el);
    const result = probe.getBoundingClientRect().top - el.getBoundingClientRect().top;
    probe.remove();
    return result;
}

function contents(f) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
	if (this.readyState == 4 && this.status == 200) {
	    f(xhttp.responseText);
	}
    };
    xhttp.open("GET", location.origin+"/force"+location.pathname, true); // to get the real html
    xhttp.send();
}


document.addEventListener("DOMContentLoaded", function() {

    contents( function(text) {

	var b1 = text.indexOf("<body");
	var b2 = text.lastIndexOf("</body>");
	if ((b1<0)||(b2<0)) return;
	var msg = text.substring(b1,b2); // not quite yet
	b1=msg.indexOf(">");
	msg = msg.substring(b1+1);
	
//	document.body.innerHTML="";

	const shell = document.body;

	var htmlSec; // the current place in shell where new stuff gets written
	var inputSpan; // the input HTML element at the bottom of the shell. note that inputSpan should always have *one text node*
	// mathJax/katex related stuff
	const webAppTagsRegExp = new RegExp("(" + Object.values(webAppTags).join("|") + ")");
	// input is a bit messy...
	var inputEndFlag = false;

	var rawList=[];

	const closeHtml = function() {
	    var anc = htmlSec.parentElement;
	    if (htmlSec.classList.contains("M2Script")) {
		//(htmlSec as HTMLScriptElement).text = dehtml(htmlSec.dataset.jsCode); // should we dehtml? need to think carefully. or should it depend whether we're inside TeX or not?
		/*	    (htmlSec as HTMLScriptElement).text = htmlSec.dataset.jsCode;
			    document.head.appendChild(htmlSec); // might as well move to head
		*/
		new Function("socket",htmlSec.dataset.jsCode)(socket); // !
		htmlSec.removeAttribute("data-js-code");
	    }
	    else if (htmlSec.classList.contains("M2Latex")) {
		//htmlSec.dataset.texCode=dehtml(htmlSec.dataset.texCode); // needed for MathJax compatibility
		try {
		    htmlSec.innerHTML=katex.renderToString(htmlSec.dataset.texCode, { trust: true, strict: false } );
		    htmlSec.removeAttribute("data-tex-code");
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
		if (anc.classList.contains("M2Latex")) { // html inside tex
		    // 18mu= 1em * mathfont size modifier, here 1.21 factor of KaTeX
		    var fontSize = +(window.getComputedStyle(htmlSec,null).getPropertyValue("font-size").split("px",1)[0])*1.21;
		    var baseline = baselinePosition(htmlSec);
		    anc.dataset.texCode+="\\htmlId{raw"+rawList.length+"}{\\vphantom{"
			+"\\raisebox{"+(baseline/fontSize)+"ce}{}"
			+"\\raisebox{"+((baseline-htmlSec.offsetHeight)/fontSize)+"ce}{}"
			+"}\\hspace{"+(htmlSec.offsetWidth/fontSize)+"ce}" // the hspace is really just for debugging
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
	    // highlight
	    htmlSec.innerHTML=Prism.highlight(htmlSec.textContent,Prism.languages.macaulay2);
	    htmlSec.classList.add("M2PastInput");
	    closeHtml();
	}

	const createHtml = function(a, className) {
	    var anc = htmlSec;
	    htmlSec=document.createElement(a);
	    if (className) {
		htmlSec.className=className;
		if (className.indexOf("M2Html")>=0)
		    htmlSec.dataset.saveHTML=""; // need to keep track of innerHTML because html tags may get broken
	    }
	    anc.appendChild(htmlSec);
	}

	//createHtml("div","M2Html");
	shell.classList.add("M2Html"); shell.dataset.saveHTML="";
	htmlSec=shell;
	
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
		    //		    createHtml("script","M2Script");
		    createHtml("span","M2Script");
		    htmlSec.dataset.jsCode=""; // can't write directly to text because scripts can only be written once!
		}
		else if (tag==webAppTags.Input) { // input section: a bit special (ends at first \n)
		    createHtml("span","M2Input");
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
			    htmlSec.appendChild(document.createTextNode(txt[i].substring(0,ii+1)));
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
		    htmlSec.appendChild(document.createTextNode(txt[i]));
	    }
	}
	closeHtml();
	shell.classList.remove("M2Html");
    });
});
