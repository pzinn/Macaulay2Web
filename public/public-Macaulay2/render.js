// borrowed from tags.js
var webAppTagCodes = [
    ["End", 17, ""],
    ["Html", 18, "M2Html"],
    ["Output", 19, "M2Html M2Output"],
    ["Input", 20, "M2Input"],
    ["InputContd", 28, "M2Input"],
    ["Url", 29, "M2Url"],
    ["Text", 30, "M2Text"],
    ["Tex", 31, "M2Katex"],
];
var webAppTags = {};
var webAppClasses = {};
webAppTagCodes.forEach(function (x) {
    webAppTags[x[0]] = String.fromCharCode(x[1]);
    webAppClasses[String.fromCharCode(x[1])] = x[2];
});

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

	const closeHtml = function () {
	    const anc = htmlSec.parentElement;
	    if (htmlSec.classList.contains("M2Url")) {
		/*
		const url = htmlSec.dataset.code;
		if (url.startsWith("/usr/share/doc/Macaulay2"))
		    window.open(url, "M2 help");
		else socket.emit("download", url);
		*/
		htmlSec.removeAttribute("data-code");
	    } else if (htmlSec.classList.contains("M2Katex")) {
		try {
		    htmlSec.innerHTML = katex
			.__renderToHTMLTree(htmlSec.dataset.code, {
			    trust: true,
			    strict: false,
			})
			.toMarkup(); // one could call katex.renderToString instead but mathml causes problems
		    htmlSec.removeAttribute("data-code");
		    // restore raw stuff
		    if (htmlSec.dataset.idList)
			htmlSec.dataset.idList.split(" ").forEach(function (id) {
			    const el = document.getElementById("raw" + id);
			    el.style.display = "contents"; // could put in css but don't want to overreach
			    el.style.fontSize = "0.826446280991736em"; // to compensate for katex's 1.21 factor
			    el.innerHTML = "";
			    el.appendChild(rawList[+id]);
			});
		    //
		    //htmlSec.dataset.code=htmlSec.innerHTML; // not needed: going to die anyway
		} catch (err) {
		    htmlSec.classList.add("KatexError"); // TODO: better class for this?
		    htmlSec.innerHTML = err.message;
		    console.log(err.message);
		}
	    }
	    if (anc.classList.contains("M2Html")) {
		// we need to convert to string :/
		anc.innerHTML = anc.dataset.code += htmlSec.outerHTML;
	    } else {
		htmlSec.removeAttribute("data-code");
		if (anc.classList.contains("M2Katex")) {
		    // html inside tex
		    // 18mu= 1em * mathfont size modifier, here 1.21 factor of KaTeX
		    const fontSize =
			  +window
			  .getComputedStyle(htmlSec, null)
			  .getPropertyValue("font-size")
			  .split("px", 1)[0] * 1.21;
		    const baseline = baselinePosition(htmlSec);
		    anc.dataset.code +=
			"\\htmlId{raw" +
			rawList.length +
			"}{\\vphantom{" + // the vphantom ensures proper horizontal space
			"\\raisebox{" +
			baseline / fontSize +
			"ce}{}" +
			"\\raisebox{" +
			(baseline - htmlSec.offsetHeight) / fontSize +
			"ce}{}" +
			"}\\hspace{" +
			htmlSec.offsetWidth / fontSize +
			"ce}" + // the hspace is really just for debugging
			"}";
		    if (!anc.dataset.idList) anc.dataset.idList = rawList.length;
		    else anc.dataset.idList += " " + rawList.length;
		    rawList.push(htmlSec); // try on { (help det)#2#1#0#1#0#0 }
		    /*
		      anc.dataset.code+="{\\rawhtml{"+htmlSec.outerHTML+"}{"
		      +(baseline/fontSize)+"ce}{"+((htmlSec.offsetHeight-baseline)/fontSize)+"ce}}";
		    */
		}
	    }
	    htmlSec = anc;
	};
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
	    if (className) htmlSec.className=className;
	    anc.appendChild(htmlSec);
	}

	//createHtml("div","M2Html");
	shell.classList.add("M2Html"); shell.dataset.code="";
	htmlSec=shell;
	
	const txt = msg.split(webAppTagsRegExp);
	for (let i = 0; i < txt.length; i += 2) {
	    // if we are at the end of an input section
	    if (
		inputEndFlag &&
		    ((i == 0 && txt[i].length > 0) ||
		     (i > 0 && txt[i - 1] !== webAppTags.InputContd))
	    ) {
		closeInput();
		inputEndFlag = false;
	    }
	    if (i > 0) {
		const tag = txt[i - 1];
		if (tag == webAppTags.End) {
		    // end of section
		    if (htmlSec.classList.contains("M2Input")) closeInput(); // should never happen but does because of annoying escape sequence garbage bug (see also closeInput fix)
		    closeHtml();
		} else if (tag === webAppTags.InputContd) {
		    // continuation of input section
		    inputEndFlag = false;
		} else {
		    // new section
		    createHtml("span", webAppClasses[tag]);
		    if (tag !== webAppTags.Input && tag !== webAppTags.Text) {
			htmlSec.dataset.code = ""; // even M2Html needs to keep track of innerHTML because html tags may get broken
		    }
		}
	    }
	    if (txt[i].length > 0) {
		let l = htmlSec.classList;
		// for next round, check if we're nearing the end of an input section
		if (l.contains("M2Input")) {
		    const ii = txt[i].indexOf("\n");
		    if (ii >= 0) {
			if (ii < txt[i].length - 1) {
			    // need to do some surgery
			    htmlSec.insertBefore(
				document.createTextNode(txt[i].substring(0, ii + 1)),
				inputSpan
			    );
			    txt[i] = txt[i].substring(ii + 1, txt[i].length);
			    closeInput();
			    l = htmlSec.classList;
			} else inputEndFlag = true; // can't tell for sure if it's the end or not, so set a flag to remind us
		    }
		}

		if (htmlSec.dataset.code !== undefined) {
		    htmlSec.dataset.code += txt[i];
		    if (l.contains("M2Html")) htmlSec.innerHTML = htmlSec.dataset.code; // might as well update in real time
		}
		// all other states are raw text -- don't rewrite htmlSec.textContent+=txt[i] in case of input
		else htmlSec.appendChild(document.createTextNode(txt[i]));
	    }
	}
	closeHtml();
	shell.classList.remove("M2Html");
    });
});
