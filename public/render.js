// borrowed from tags.js
const webAppTagCodes = [
    ["End", 17, ""], // end of section script
    ["Html", 18, "M2Html"], // indicates what follows is HTML
    ["Cell", 19, "M2Text M2Cell"], // cell (bundled input + output)
    ["Input", 20, "M2Text M2Input"], // it's text but it's input
    ["InputContd", 28, "M2Text M2Input"], // text, continuation of input
    ["Url", 29, "M2Url"], // url
    ["Text", 30, "M2Text"], // indicates what follows is pure text; default mode
    ["Tex", 36, "M2Katex"] // TeX
];
var webAppTags = {};
var webAppClasses = {};
webAppTagCodes.forEach(function (x) {
    webAppTags[x[0]] = String.fromCharCode(x[1]);
    webAppClasses[String.fromCharCode(x[1])] = x[2];
});
webAppTags.Tex = "(?<=[^\\\\])\\$";
const webAppRegex = new RegExp("(" + Object.values(webAppTags).join("|") + ")");
webAppTags.Tex = "$";

var katexMacros = {
  "\\break": "\\\\",
  "\\R": "\\mathbb{R}",
  "\\C": "\\mathbb{C}",
  "\\ZZ": "\\mathbb{Z}",
  "\\NN": "\\mathbb{N}",
  "\\QQ": "\\mathbb{Q}",
  "\\RR": "\\mathbb{R}",
  "\\CC": "\\mathbb{C}",
  "\\PP": "\\mathbb{P}",
};
var katexOptions = {
  macros: katexMacros,
  displayMode: true,
  trust: true,
  strict: false,
  maxExpand: Infinity,
};


function dehtml(s) {
    // these are all the substitutions performed by M2
    //  s = s.replace(/&bsol;/g, "\\");
    //s = s.replace(/&dollar;/g,"$");
    s = s.replace(/&lt;/g, "<");
    s = s.replace(/&gt;/g, ">");
    s = s.replace(/&quot;/g, '"');
    s = s.replace(/&amp;/g, "&"); // do this one last
    return s;
}

const baselinePosition = function(el) {
    const probe = document.createElement('span');
    probe.appendChild(document.createTextNode('X')); probe.style.fontSize = '0'; probe.style.visibility = 'hidden';
    el.parentElement.insertBefore(probe,el);
    const result = probe.getBoundingClientRect().top - el.getBoundingClientRect().top;
    probe.remove();
    return result;
}

const unselectCells = function () {
    const lst = Array.from(document.getElementsByClassName("M2CellSelected"));
    lst.forEach((el) => {
	el.classList.remove("M2CellSelected");
    });
};

const barKey = function (e) {
    e.stopPropagation();
    let fn;
    if (e.key == " ") fn = (el) => el.classList.toggle("M2CellClosed");
    else if (e.key == "Delete" || e.key == "Backspace")
	fn = (el) => el.remove();
    else if (e.key == "w" || e.key == "W")
	fn = (el) => el.classList.toggle("M2Wrapped");
    else return;
    e.preventDefault();
    Array.from(document.getElementsByClassName("M2CellSelected")).forEach(fn);
};

const barClick = function (e) {
    e.stopPropagation();
};
const barMouseDown = function (e) {
    const t = this.parentElement;
    if (!e.shiftKey && !e.ctrlKey) unselectCells();
    if (e.shiftKey && document.activeElement.classList.contains("M2CellBar")) {
	const tt = document.activeElement.parentElement;
	const lst = document.getElementsByClassName("M2Cell");
	let i = 0;
	let flag = 0;
	while (i < lst.length && flag < 2) {
            if (lst[i] == t || lst[i] == tt) flag++;
            if (lst[i] == t || lst[i] == tt || flag == 1)
		lst[i].classList.add("M2CellSelected");
            i++;
	}
    } else t.classList.toggle("M2CellSelected");
    e.preventDefault();
    this.focus();
};

function b64DecodeUnicode(str) { // so complicated...
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

render = function(text) { // borrowed from shellEmulator (TODO: merge of course)
    text = b64DecodeUnicode(text);
    var b1 = text.indexOf("<body");
    var b2 = text.lastIndexOf("</body>");
    if ((b1<0)||(b2<0)) return;
    var msg = text.substring(b1,b2); // not quite yet
    b1=msg.indexOf(">");
    msg = msg.substring(b1+1);
    
    //	document.body.innerHTML="";

    const shell = document.body;

    var htmlSec; // the current place in shell where new stuff gets written
    // mathJax/katex related stuff
    // input is a bit messy...
    var inputEndFlag = false;

    var rawList=[];

    var closeHtml = function () {
        if (htmlSec.classList.contains("M2KatexDisplayTemp")) {
	    htmlSec.classList.remove("M2KatexDisplayTemp");
	    return;
        }
	var anc = htmlSec.parentElement;
	if (htmlSec.classList.contains("M2Input")) {
	    anc.appendChild(document.createElement("br")); // this first for spacing purposes
	    htmlSec.classList.add("M2PastInput");
	} else if (htmlSec.classList.contains("M2Url")) {
	    let url = htmlSec.dataset.code.trim();
	    if (url[0] != "/" && url.substr(0, 4) != "http") url = "/relative/" + url; // for relative URLs
	    if (iFrame) iFrame.src = url;
	    else window.open(url, "M2 browse");
	} else if (htmlSec.classList.contains("M2Katex")) {
	    try {
                var katexRes = katex.__renderToHTMLTree(
		    dehtml(htmlSec.dataset.code),// encoding is *not* compulsory
		    katexOptions).children[0]; // bit of a hack: to remove the overall displayMode, keeping just displayStyle
		htmlSec.appendChild(katexRes.toNode()); // need to be part of document to use getElementById
		// restore raw stuff
		if (htmlSec.dataset.idList) {
		    htmlSec.dataset.idList.split(" ").forEach(function (id) {
			var el = document.getElementById("raw" + id);
			if (el) {
			    el.style.display = "contents"; // could put in css but don't want to overreach
			    el.style.fontSize = "0.826446280991736em"; // to compensate for katex's 1.21 factor
			    el.innerHTML = "";
			    el.appendChild(rawList[+id]);
			} else console.log("error restoring html element");
		    });
		}
	    } catch (err) {
		htmlSec.classList.add("KatexError"); // TODO: better class for this?
		htmlSec.innerHTML = err.message;
		console.log(err.message);
	    }
	} else if (htmlSec.classList.contains("M2Html")) {
	    htmlSec.insertAdjacentHTML("beforeend", htmlSec.dataset.code); // since we don't update in real time any more, html only updated at the end
	    if (htmlSec.dataset.idList)
		htmlSec.dataset.idList.split(" ").forEach(function (id) {
		    var el = document.getElementById("raw" + id);
		    if (el) {
			el.style.display = "contents"; // could put in css but don't want to overreach
			//            el.style.fontSize = "1em";
			//            el.innerHTML = "";
			el.appendChild(rawList[+id]);
		    } else console.log("error restoring html element");
		});
	}
	htmlSec.removeAttribute("data-code");
	if (anc.classList.contains("M2Html") && anc.dataset.code != "") {
	    //anc.dataset.code += htmlSec.outerHTML; // used to convert to string which would destroy event listeners
	    // stack instead
	    anc.dataset.code += '<span id="raw' + rawList.length + '"></span>';
	    if (!anc.dataset.idList) anc.dataset.idList = rawList.length;
	    else anc.dataset.idList += " " + rawList.length;
	    rawList.push(htmlSec);
	} else if (anc.classList.contains("M2Katex")) {
	    // html inside tex
	    // 18mu= 1em * mathfont size modifier, here 1.21 factor of KaTeX
	    var fontSize =
		+window
		.getComputedStyle(htmlSec, null)
		.getPropertyValue("font-size")
		.split("px", 1)[0] * 1.21;
	    var baseline = baselinePosition(htmlSec);
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
	    rawList.push(htmlSec); // try on { (help det)#2#1#1#0#0 }
	}
	htmlSec = anc;
    };

    var createHtml = function (a, className) {
        var anc = htmlSec;
        htmlSec = document.createElement(a);
        if (className) {
	    htmlSec.className = className;
	    if (className.indexOf("M2Cell") >= 0) {
                // insert bar at left
                var s = document.createElement("span");
                s.className = "M2CellBar";
		s.onmousedown = barMouseDown;
		s.onclick = barClick;
		s.onkeydown = barKey;
		s.tabIndex = 0;
		s.title = "Click to select then\nDelete to delete\nSpace to shrink\nw to wrap";
                htmlSec.appendChild(s);
	    }
        }
        if (className.indexOf("M2Text") < 0)
	    htmlSec.dataset.code = "";
        // even M2Html needs to keep track of innerHTML because html tags may get broken
        anc.appendChild(htmlSec);
    };

    //createHtml("div","M2Html");
    shell.classList.add("M2Html"); shell.dataset.code="";
    htmlSec=shell;
    
    const txt = msg.split(webAppRegex);
    for (let i = 0; i < txt.length; i += 2) {
	// if we are at the end of an input section
	if (
	    inputEndFlag &&
		((i == 0 && txt[i].length > 0) ||
		 (i > 0 && txt[i - 1] !== webAppTags.InputContd))
	) {
	    closeHtml();
	    inputEndFlag = false;
	}
	if (i > 0) {
	    const tag = txt[i - 1];
	    if (tag == webAppTags.End || (tag == webAppTags.Tex && htmlSec.classList.contains("M2Katex") && htmlSec.dataset.code != ""))
	    { // last condition means, not a $$
		// end of section
		closeHtml();
	    } else if (tag === webAppTags.InputContd) {
		// continuation of input section
		inputEndFlag = false;
	    } else if ( tag == webAppTags.Tex && htmlSec.classList.contains("M2Katex") && htmlSec.dataset.code == "" ) {
		htmlSec.classList.add("M2KatexDisplayTemp"); // second $
		htmlSec.classList.add("M2KatexDisplay");
	    } else if ( tag == webAppTags.Tex && !htmlSec.classList.contains("M2Html") ) {
		// false alarm
		txt[i] = webAppTags.Tex + txt[i];
	    } else {
		// new section
		createHtml("span", webAppClasses[tag]);
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
			htmlSec.appendChild(
			    document.createTextNode(txt[i].substring(0, ii + 1))
			);
			txt[i] = txt[i].substring(ii + 1, txt[i].length);
			closeHtml();
			l = htmlSec.classList;
		    } else inputEndFlag = true; // can't tell for sure if it's the end or not, so set a flag to remind us
		}
	    }

	    if (htmlSec.dataset.code !== undefined)
		htmlSec.dataset.code += txt[i];
	    // all other states are raw text -- don't rewrite htmlSec.textContent+=txt[i] in case of input
	    else htmlSec.appendChild(document.createTextNode(txt[i]));
	}
    }
    closeHtml();
    shell.classList.remove("M2Html");
};
