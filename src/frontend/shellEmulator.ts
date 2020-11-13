import { Socket } from "./mathProgram";

import { webAppTags, webAppClasses, webAppRegex } from "./tags";
import {
  scrollDownLeft,
  scrollDown,
  scrollLeft,
  baselinePosition,
  placeCaret,
  addToElement,
  placeCaretAtEnd,
  attachElement,
  sanitizeElement,
} from "./htmlTools";

//const unicodeBell = "\u0007";
declare const katex;
const katexMacros = {
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
const katexOptions = {
  macros: katexMacros,
  displayMode: true,
  trust: true,
  strict: false,
  maxExpand: Infinity,
};

//const Prism = require('prismjs');
const M2symbols = require("./prism-M2");

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

const unselectCells = function () {
  const lst = Array.from(document.getElementsByClassName("M2CellSelected"));
  lst.forEach((el) => {
    el.classList.remove("M2CellSelected");
  });
};

const Shell = function (
  shell: HTMLElement,
  socket: Socket,
  editor: HTMLElement,
  editorToggle: HTMLInputElement,
  iFrame: HTMLFrameElement
) {
  // Shell is an old-style javascript oop constructor
  // we're using arguments as private variables, cf
  // https://stackoverflow.com/questions/18099129/javascript-using-arguments-for-closure-bad-or-good
  const obj = this; // for nested functions with their own 'this'. or one could use bind, or => functions, but simpler this way
  let htmlSec; // the current place in shell where new stuff gets written
  let inputSpan; // the input HTML element at the bottom of the shell. note that inputSpan should always have *one text node*
  const cmdHistory: any = []; // History of commands for shell-like arrow navigation
  cmdHistory.index = 0;
  let autoComplete = null; // autocomplete HTML element (when tab is pressed)
  // input is a bit messy...
  let inputEndFlag = false;
  let procInputSpan = null; // temporary span containing currently processed input

  const createHtml = function (a, className?) {
    const anc = htmlSec;
    htmlSec = document.createElement(a);
    if (className) {
      htmlSec.className = className;
      if (className.indexOf("M2Cell") >= 0) {
        // insert bar at left
        const s = document.createElement("span");
        s.className = "M2CellBar";
        s.tabIndex = 0;
        s.title =
          "Click to select then\nDelete to delete\nSpace to shrink\nw to wrap\nEnter to run";
        htmlSec.appendChild(s);
      }
    }
    if (className.indexOf("M2Text") < 0) htmlSec.dataset.code = "";
    // even M2Html needs to keep track of innerHTML because html tags may get broken
    if (inputSpan.parentElement == anc) anc.insertBefore(htmlSec, inputSpan);
    else anc.appendChild(htmlSec);
  };

  const createInputEl = function () {
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
    inputSpan.classList.add("M2Text");

    htmlSec = shell;
    createHtml("span", webAppClasses[webAppTags.Cell]);

    htmlSec.appendChild(inputSpan);

    inputSpan.focus();

    inputEndFlag = false;
  };

  createInputEl();

  obj.codeInputAction = function (e) {
    if (e.currentTarget.ownerDocument.getSelection().isCollapsed) {
      // will only trigger if selection is empty
      this.classList.add("codetrigger");
      if (e.target.tagName.substring(0, 4) == "CODE")
        obj.postMessage(e.target.textContent, false, false);
      else {
        // past input: almost the same but not quite: code not sent, just replaces input
        let str = this.textContent;
        if (str[str.length - 1] == "\n") str = str.substring(0, str.length - 1); // cleaner this way
        // inputSpan.textContent = str;
        // placeCaretAtEnd(inputSpan);
        inputSpan.focus();
        document.execCommand("selectAll");
        document.execCommand("insertText", false, str);
        scrollDown(shell);
      }
      e.stopPropagation();
      setTimeout(() => {
        this.classList.remove("codetrigger");
      }, 100);
    }
  };

  const removeAutoComplete = function (flag) {
    // flag means insert the selection or not
    if (autoComplete) {
      const pos = inputSpan.textContent.length;
      inputSpan.textContent += autoComplete.lastChild.textContent;
      const autoCompleteSelection = document.getElementById(
        "autocomplete-selection"
      ); // the currently selected element in the autocomplete list
      if (flag && autoCompleteSelection)
        addToElement(inputSpan, pos, autoCompleteSelection.dataset.fullword);
      else addToElement(inputSpan, pos, autoComplete.dataset.word);
      autoComplete.remove();
      autoComplete = null;
    }
  };

  const removeDelimiterHighlight = function () {
    inputSpan.removeAttribute("data-highlight");
    inputSpan.removeAttribute("data-highlight-error");
  };

  // partial support for unicode symbols
  // symbols are ordered; from most useful to least
  // prettier-ignore
  const UCsymbols = {
      "Alpha": 0x391, "Beta": 0x392, "Chi": 0x3a7, "Delta": 0x394, "Epsilon": 0x395, "Eta": 0x397, "Gamma": 0x393, "Iota": 0x399, "Kappa": 0x39a, "Lambda": 0x39b, "Mu": 0x39c, "Nu": 0x39d, "Omega": 0x3a9, "Omicron": 0x39f, "Phi": 0x3a6, "Pi": 0x3a0, "Psi": 0x3a8, "Rho": 0x3a1, "Sigma": 0x3a3, "Tau": 0x3a4, "Theta": 0x398, "Upsilon": 0x3a5, "Xi": 0x39e, "Zeta": 0x396, "alpha": 0x3b1, "beta": 0x3b2, "chi": 0x3c7, "delta": 0x3b4, "epsilon": 0x3f5, "eta": 0x3b7, "gamma": 0x3b3, "iota": 0x3b9, "kappa": 0x3ba, "lambda": 0x3bb, "mu": 0x3bc, "nu": 0x3bd, "omega": 0x3c9, "omicron": 0x3bf, "phi": 0x3d5, "pi": 0x3c0, "psi": 0x3c8, "rho": 0x3c1, "sigma": 0x3c3, "tau": 0x3c4, "theta": 0x3b8, "upsilon": 0x3c5, "varepsilon": 0x3b5, "varphi": 0x3c6, "varpi": 0x3d6, "varrho": 0x3f1, "varsigma": 0x3c2, "vartheta": 0x3d1, "xi": 0x3be, "zeta": 0x3b6,
      "CC": 0x2102, "HH": 0x210d, "NN": 0x2115, "PP": 0x2119, "QQ": 0x211a, "RR": 0x211d,  "ZZ": 0x2124,
      "Im": 0x2111, "Re": 0x211c, "infty": 0x221e, "nabla": 0x2207, "wp": 0x2118,
      "ell": 0x2113, "hbar": 0x210f,
      "aleph": 0x2135, "beth": 0x2136, "gimel": 0x2137, "daleth": 0x2138,
      "\n": 0xa
  };

  const UCsymbolKeys = Object.keys(UCsymbols).sort();

  const returnSymbol = "\u21B5";

  const postRawMessage = function (msg: string) {
    socket.emit("input", msg);
  };

  const UCsymbolValues = Object.values(UCsymbols)
    .map((i) => String.fromCharCode(i))
    .join("");
  const sanitizeRegEx = new RegExp("[^ -~" + UCsymbolValues + "]", "g"); // a bit too restrictive?
  const sanitizeInput = function (msg: string) {
    // sanitize input
    return msg.replace(sanitizeRegEx, "").replace(/\n+$/, "");
  };

  obj.postMessage = function (msg, flag1, flag2) {
    // send input, adding \n if necessary
    removeAutoComplete(false); // remove autocomplete menu if open
    removeDelimiterHighlight();
    let clean = sanitizeInput(msg);
    if (clean.length > 0) {
      obj.addToHistory(clean);
      if (procInputSpan === null) {
        // it'd be nicer to use ::before on inputSpan but sadly caret issues... cf https://stackoverflow.com/questions/60843694/cursor-position-in-an-editable-div-with-a-before-pseudo-element
        procInputSpan = document.createElement("span");
        procInputSpan.classList.add("M2Input");
        inputSpan.parentElement.insertBefore(procInputSpan, inputSpan);
      }
      procInputSpan.textContent += clean + returnSymbol;
      inputSpan.textContent = "";
      scrollDownLeft(shell);
      if (flag2) placeCaret(inputSpan, 0);
      clean = clean + "\n";
      if (flag1) obj.addToEditor(clean);
      postRawMessage(clean);
    }
  };

  obj.addToEditor = function (msg) {
    // add command to editor area
    if (typeof msg !== "undefined") {
      if (editor !== null) {
        editor.appendChild(document.createTextNode(msg));
        scrollDownLeft(editor);
      }
    }
  };

  obj.addToHistory = function (msg) {
    const input = msg.split("\n");
    for (let line = 0; line < input.length; line++) {
      if (input[line].length > 0) {
        cmdHistory.index = cmdHistory.push(input[line]);
      }
    }
  };

  const downArrowKeyHandling = function () {
    if (cmdHistory.index < cmdHistory.length) {
      cmdHistory.index++;
      if (cmdHistory.index === cmdHistory.length) {
        inputSpan.textContent = cmdHistory.current;
      } else {
        inputSpan.textContent = cmdHistory[cmdHistory.index];
      }
    }
  };

  const upArrowKeyHandling = function () {
    if (cmdHistory.index > 0) {
      if (cmdHistory.index === cmdHistory.length) {
        cmdHistory.current = inputSpan.textContent;
      }
      cmdHistory.index--;
      inputSpan.textContent = cmdHistory[cmdHistory.index];
    }
  };

  const escapeKeyHandling = function (pos) {
    let esc = inputSpan.textContent.indexOf("\u250B");
    if (esc < 0) document.execCommand("insertText", false, "\u250B");
    //addToElement(inputSpan, pos, "\u250B");
    else {
      let s;
      if (esc < pos) {
        s = inputSpan.textContent.substring(esc + 1, pos);
        while (esc < pos) {
          document.execCommand("delete");
          pos--;
        }
        /*
        inputSpan.textContent =
          inputSpan.textContent.substring(0, esc) +
          inputSpan.textContent.substring(pos, inputSpan.textContent.length);
        pos = esc;
	    */
      } else {
        s = inputSpan.textContent.substring(pos, esc);
        /*
        inputSpan.textContent =
          inputSpan.textContent.substring(0, pos) +
          inputSpan.textContent.substring(
            esc + 1,
            inputSpan.textContent.length
            );*/
        while (pos <= esc) {
          document.execCommand("forwardDelete");
          esc--;
        }
      }

      let sss = "";
      if (s.length > 0)
        for (const ss in UCsymbols) {
          if (ss.startsWith(s)) {
            sss = String.fromCharCode(UCsymbols[ss]);
            break;
          }
        }
      //      addToElement(inputSpan, pos, sss);
      document.execCommand("insertText", false, sss);
    }
  };

  const tabKeyHandling = function (pos) {
    const msg = inputSpan.textContent;
    let i = pos - 1;
    while (
      i >= 0 &&
      ((msg[i] >= "A" && msg[i] <= "Z") || (msg[i] >= "a" && msg[i] <= "z"))
    )
      i--; // would be faster with regex
    const word = msg.substring(i + 1, pos);
    if (word == "") return false;
    scrollDown(shell);
    const flag = i < 0 || msg[i] != "\u250B";
    if (flag) i++; // !flag => include the escape symbol
    const lst = flag ? M2symbols : UCsymbolKeys;

    // find all symbols starting with last word of msg
    let j = 0;
    while (j < lst.length && lst[j] < word) j++;
    if (j < lst.length) {
      let k = j;
      while (k < lst.length && lst[k].substring(0, word.length) == word) k++;
      if (k > j) {
        if (k == j + 1) {
          // yay, one solution
          if (flag)
            /*
            addToElement(
              inputSpan,
              pos,
              lst[j].substring(word.length, lst[j].length) + " "
            );
		*/
            document.execCommand(
              "insertText",
              false,
              lst[j].substring(word.length, lst[j].length) + " "
            );
          else {
            while (i < pos) {
              document.execCommand("delete");
              pos--;
            }
            document.execCommand(
              "insertText",
              false,
              String.fromCharCode(UCsymbols[lst[j]])
            );
            /*
            inputSpan.textContent =
              inputSpan.textContent.substring(0, i) +
              inputSpan.textContent.substring(
                pos,
                inputSpan.textContent.length
              );
            addToElement(inputSpan, i, String.fromCharCode(UCsymbols[lst[j]]));
*/
          }
        } else {
          // more interesting: several solutions
          // obvious implementation would've been datalist + input;
          // sadly, the events generated by the input are 200% erratic, so can't use
          autoComplete = document.createElement("span");
          autoComplete.classList.add("autocomplete");
          autoComplete.dataset.word = flag ? word : "\u250B" + word;
          const tabMenu = document.createElement("ul");
          tabMenu.setAttribute("tabindex", "0"); // hack
          for (let l = j; l < k; l++) {
            const opt = document.createElement("li");
            opt.textContent = lst[l];
            opt.dataset.fullword = flag
              ? lst[l] + " "
              : String.fromCharCode(UCsymbols[lst[l]]);
            opt.addEventListener("mouseover", function () {
              const el = document.getElementById("autocomplete-selection");
              if (el) el.removeAttribute("id");
              this.id = "autocomplete-selection";
            });
            tabMenu.appendChild(opt);
          }
          tabMenu.firstElementChild.id = "autocomplete-selection";
          autoComplete.appendChild(tabMenu);
          autoComplete.appendChild(
            document.createTextNode(
              inputSpan.textContent.substring(pos, inputSpan.textContent.length)
            )
          );
          inputSpan.textContent = inputSpan.textContent.substring(0, i);
          inputSpan.parentElement.appendChild(autoComplete);
          tabMenu.addEventListener("click", function (e) {
            removeAutoComplete(true);
            e.preventDefault();
            e.stopPropagation();
            return;
          });
          tabMenu.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
              removeAutoComplete(true);
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            if (e.key == "ArrowDown") {
              const autoCompleteSelection = document.getElementById(
                "autocomplete-selection"
              ); // the currently selected element in the autocomplete list
              if (autoCompleteSelection != this.lastElementChild) {
                autoCompleteSelection.removeAttribute("id");
                autoCompleteSelection.nextElementSibling.id =
                  "autocomplete-selection";
              }
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            if (e.key == "ArrowUp") {
              const autoCompleteSelection = document.getElementById(
                "autocomplete-selection"
              ); // the currently selected element in the autocomplete list
              if (autoCompleteSelection != this.firstElementChild) {
                autoCompleteSelection.removeAttribute("id");
                autoCompleteSelection.previousElementSibling.id =
                  "autocomplete-selection";
              }
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            if (e.key == "Escape") {
              removeAutoComplete(false);
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          });
          tabMenu.focus();
        }
      }
    }
    return true;
  };

  const openingDelimiters = '([{"';
  const closingDelimiters = ')]}"';

  const closingDelimiterHandling = function (pos, closing) {
    if (
      inputSpan.parentElement != htmlSec ||
      !htmlSec.classList.contains("M2Input")
    )
      return;
    // the first only happens in transitional state; the second if we turned off webapp mode
    // in both cases it's simpler to deactivate highlighting
    const index = closingDelimiters.indexOf(closing);
    if (index < 0) return;
    removeDelimiterHighlight();
    const opening = openingDelimiters[index];
    const len = htmlSec.textContent.length - inputSpan.textContent.length + pos; // eww
    const input = htmlSec.textContent;
    const highlight = input.replace(/./g, " "); // only newlines left
    if (openingDelimiters[index] == closing) {
      // quotes need to be treated separately
      if (pos > 0 && inputSpan.textContent[pos - 1] == "\\") return; // \" does not trigger highlighting
      let flag = 0;
      let last = -1;
      let i;
      for (i = 0; i < input.length && (i < len || flag == 0); i++)
        if (input[i] == closing && (i == 0 || input[i - 1] != "\\")) {
          flag = 1 - flag;
          last = i;
        }
      if (flag == 0) return;
      if (last < len) {
        // it was closing "
        inputSpan.dataset.highlight =
          highlight.substring(0, last) +
          opening +
          highlight.substring(last + 1, len) +
          closing;
      } else {
        // it was opening "
        inputSpan.dataset.highlight =
          highlight.substring(0, len) +
          opening +
          highlight.substring(len + 1, last + 1) +
          closing;
      }
      setTimeout(function () {
        inputSpan.removeAttribute("data-highlight");
      }, 1000);
    } else {
      let i, j;
      const depth = [];
      for (i = 0; i < openingDelimiters.length; i++)
        depth.push(i == index ? 1 : 0);
      i = len;
      while (i > 0 && depth[index] > 0) {
        i--;
        j = openingDelimiters.indexOf(input[i]);
        if (j >= 0) {
          if (openingDelimiters[j] == closingDelimiters[j]) {
            if (i == 0 || input[i - 1] != "\\")
              // ignore \"
              depth[j] = 1 - depth[j];
          } else {
            depth[j]--;
            if (depth[j] < 0) break;
          }
        } else {
          j = closingDelimiters.indexOf(input[i]);
          if (j >= 0) depth[j]++;
        }
      }
      if (depth.every((val) => val == 0)) {
        inputSpan.dataset.highlight =
          highlight.substring(0, i) +
          opening +
          highlight.substring(i + 1, len) +
          closing;
        setTimeout(function () {
          inputSpan.removeAttribute("data-highlight");
        }, 1000);
      } else
        inputSpan.dataset.highlightError =
          highlight.substring(0, len) + closing;
      setTimeout(function () {
        inputSpan.removeAttribute("data-highlight-error");
      }, 1000);
    }
  };

  const openingDelimiterHandling = function (pos, opening) {
    if (
      inputSpan.parentElement != htmlSec ||
      !htmlSec.classList.contains("M2Input")
    )
      return;
    // the first only happens in transitional state; the second if we turned off webapp mode
    const index = openingDelimiters.indexOf(opening);
    if (index < 0) return;
    removeDelimiterHighlight();
    const closing = closingDelimiters[index];
    const len = htmlSec.textContent.length - inputSpan.textContent.length + pos; // eww
    const input = htmlSec.textContent; // we don't truncate
    const highlight = input.replace(/./g, " "); // only newlines left
    let i, j;
    const depth = [];
    for (i = 0; i < openingDelimiters.length; i++)
      depth.push(i == index ? 1 : 0);
    i = len - 1;
    while (i < input.length - 1 && depth[index] > 0) {
      i++;
      j = closingDelimiters.indexOf(input[i]);
      if (j >= 0) {
        if (openingDelimiters[j] == closingDelimiters[j]) {
          if (i == 0 || input[i - 1] != "\\")
            // ignore \"
            depth[j] = 1 - depth[j];
        } else {
          depth[j]--;
          if (depth[j] < 0) break;
        }
      } else {
        j = openingDelimiters.indexOf(input[i]);
        if (j >= 0) depth[j]++;
      }
    }
    if (depth.every((val) => val == 0)) {
      inputSpan.dataset.highlight =
        highlight.substring(0, len) +
        opening +
        highlight.substring(len + 1, i + 1) +
        closing;
      setTimeout(function () {
        inputSpan.removeAttribute("data-highlight");
      }, 1000);
    } // we never throw an error on an opening delimiter -- it's assumed more input is coming
  };

  shell.onpaste = function () {
    placeCaretAtEnd(inputSpan, true);
    inputSpan.oninput = function () {
      inputSpan.oninput = null; // !
      sanitizeElement(inputSpan); // remove HTML tags from pasted input
    };
  };

  /*  obj.restoreInputAction = function (doc) {
    Array.from(doc.getElementsByClassName("M2PastInput")).forEach((el) => {
      (el as any).onclick = codeInputAction;
    });
  };*/

  shell.onclick = function (e) {
    if ((e.target as HTMLElement).classList.contains("M2CellBar"))
      e.stopPropagation();
    else if (
      (e.target as HTMLElement).tagName != "A" &&
      window.getSelection().isCollapsed
    ) {
      unselectCells();
      placeCaretAtEnd(inputSpan, true);
      scrollDown(shell);
    }
  };

  shell.onkeydown = function (e: KeyboardEvent) {
    removeAutoComplete(false); // remove autocomplete menu if open
    removeDelimiterHighlight();
    if ((e.target as HTMLElement).classList.contains("M2CellBar")) return;
    if (e.key == "Enter") {
      obj.postMessage(
        inputSpan.textContent,
        editorToggle && editorToggle.checked,
        true
      );
      e.preventDefault(); // no crappy <div></div> added
      return;
    }

    if ((e.key == "ArrowDown" || e.key == "ArrowUp") && !e.shiftKey) {
      if (e.key == "ArrowDown") downArrowKeyHandling();
      else upArrowKeyHandling();
      e.preventDefault();
      placeCaretAtEnd(inputSpan);
      scrollDown(shell);
      //
      return;
    }

    if (
      e.ctrlKey ||
      e.altKey ||
      e.metaKey ||
      e.key == "Shift" || // subtly different: shift key pressed (no combo)
      e.key == "PageUp" ||
      e.key == "PageDown" ||
      e.key == "F1"
    ) {
      // do not move caret on Ctrl or Command combos
      if (e.key == "PageUp" && document.activeElement == inputSpan)
        shell.focus();
      // this prevents the annoying behavior at the cost of losing the caret
      return;
    }

    if (e.key == "Home") {
      placeCaret(inputSpan, 0); // the default would sometimes use this for vertical scrolling
      scrollDownLeft(shell);
      return;
    }

    if (e.key == "End") {
      placeCaretAtEnd(inputSpan); // the default would sometimes use this for vertical scrolling
      scrollDown(shell);
      return;
    }

    // auto-completion code
    if (e.key == "Tab") {
      // try to avoid disrupting the normal tab use as much as possible
      if (
        document.activeElement == inputSpan &&
        tabKeyHandling(window.getSelection().focusOffset)
      )
        e.preventDefault();
      return;
    }

    unselectCells();
    placeCaretAtEnd(inputSpan, true);
    const pos = window.getSelection().focusOffset;
    if (pos == 0) scrollLeft(shell);

    if (closingDelimiters.indexOf(e.key) >= 0)
      closingDelimiterHandling(pos, e.key);
    else if (openingDelimiters.indexOf(e.key) >= 0)
      openingDelimiterHandling(pos, e.key);
    else if (e.key == "Escape") {
      scrollDown(shell);
      escapeKeyHandling(pos);
      e.preventDefault();
      return;
    }
  };

  const rawList = [];

  const closeHtml = function () {
    if (htmlSec == shell) return;
    if (htmlSec.classList.contains("M2KatexDisplayTemp")) {
      htmlSec.classList.remove("M2KatexDisplayTemp");
      return;
    }

    const anc = htmlSec.parentElement;

    if (htmlSec.classList.contains("M2Input"))
      anc.appendChild(document.createElement("br")); // this first for spacing purposes

    if (htmlSec.contains(inputSpan)) attachElement(inputSpan, anc);
    // move back input element to outside htmlSec

    if (htmlSec.classList.contains("M2Input")) {
      // highlight
      htmlSec.innerHTML = Prism.highlight(
        htmlSec.textContent,
        Prism.languages.macaulay2
      );
      htmlSec.classList.add("M2PastInput");
      htmlSec.onclick = obj.codeInputAction;
    } else if (htmlSec.classList.contains("M2Url")) {
      let url = htmlSec.dataset.code.trim();
      if (url[0] != "/" && url.substr(0, 4) != "http") url = "/relative/" + url; // for relative URLs
      if (iFrame) iFrame.src = url;
      else window.open(url, "M2 browse");
    } else if (htmlSec.classList.contains("M2Katex")) {
      try {
        // one could call katex.renderToString or whatever instead but mathml causes problems
        const katexRes = katex.__renderToHTMLTree(
          dehtml(htmlSec.dataset.code), // encoding is *not* compulsory
          katexOptions
        ).children[0]; // bit of a hack: to remove the overall displayMode, keeping just displayStyle
        htmlSec.appendChild(katexRes.toNode());
        // restore raw stuff
        if (htmlSec.dataset.idList) {
          htmlSec.dataset.idList.split(" ").forEach(function (id) {
            const el = document.getElementById("raw" + id);
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
          const el = document.getElementById("raw" + id);
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
      const fontSize: number =
        +window
          .getComputedStyle(htmlSec, null)
          .getPropertyValue("font-size")
          .split("px", 1)[0] * 1.21;
      const baseline: number = baselinePosition(htmlSec);
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

  obj.onmessage = function (msg: string) {
    if (procInputSpan !== null) {
      procInputSpan.remove();
      procInputSpan = null;
    }
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
        if (
          tag == webAppTags.End ||
          (tag == webAppTags.Tex &&
            htmlSec.classList.contains("M2Katex") &&
            htmlSec.dataset.code != "") // last condition means, not a $$
        ) {
          // end of section
          closeHtml();
        } else if (tag === webAppTags.InputContd) {
          // continuation of input section
          inputEndFlag = false;
        } else if (
          tag == webAppTags.Tex &&
          htmlSec.classList.contains("M2Katex") &&
          htmlSec.dataset.code == ""
        ) {
          htmlSec.classList.add("M2KatexDisplayTemp"); // second $
          htmlSec.classList.add("M2KatexDisplay");
        } else if (
          tag == webAppTags.Tex &&
          !htmlSec.classList.contains("M2Html")
        ) {
          // false alarm
          txt[i] = webAppTags.Tex + txt[i];
        } else {
          // new section
          createHtml("span", webAppClasses[tag]);
          if (tag === webAppTags.Input) {
            // input section: a bit special (ends at first \n)
            attachElement(inputSpan, htmlSec); // !!! we move the input inside the current span to get proper indentation !!!
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
              closeHtml();
              l = htmlSec.classList;
            } else inputEndFlag = true; // can't tell for sure if it's the end or not, so set a flag to remind us
          }
        }

        if (htmlSec.dataset.code !== undefined) htmlSec.dataset.code += txt[i];
        //          if (l.contains("M2Html")) htmlSec.innerHTML = htmlSec.dataset.code; // used to update in real time
        // all other states are raw text -- don't rewrite htmlSec.textContent+=txt[i] in case of input
        else if (inputSpan.parentElement == htmlSec)
          htmlSec.insertBefore(document.createTextNode(txt[i]), inputSpan);
        else htmlSec.appendChild(document.createTextNode(txt[i]));
      }
    }
    scrollDownLeft(shell);
  };

  obj.reset = function () {
    console.log("Reset");
    removeAutoComplete(false); // remove autocomplete menu if open
    createInputEl(); // recreate the input area
    //    htmlSec.parentElement.insertBefore(document.createElement("hr"), htmlSec); // insert an additional horizontal line to distinguish successive M2  runs
  };

  obj.interrupt = function () {
    removeAutoComplete(false); // remove autocomplete menu if open
    inputSpan.textContent = "";
    removeDelimiterHighlight();
    postRawMessage("\x03");
    placeCaretAtEnd(inputSpan);
  };

  inputSpan.focus();
};

module.exports = Shell;
