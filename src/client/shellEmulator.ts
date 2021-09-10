import { Socket, clientId } from "./main";

import { autoRender } from "./autoRender";
import { webAppTags, webAppClasses, webAppRegex } from "../common/tags";
import {
  scrollDownLeft,
  scrollDown,
  scrollLeft,
  baselinePosition,
  getCaret,
  setCaret,
  setCaretAtEndMaybe,
  attachElement,
  locateRowColumn,
  locateOffset,
  addMarker,
} from "./htmlTools";
import {
  escapeKeyHandling,
  autoCompleteHandling,
  removeAutoComplete,
  sanitizeInput,
  delimiterHandling,
  removeDelimiterHighlight,
} from "./editor";

//const unicodeBell = "\u0007";
import Prism from "prismjs";

/*
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
*/

declare global {
  interface Array<T> {
    sortedPush(el: any): number;
  }
}
Array.prototype.sortedPush = function (el: any) {
  let m = 0;
  let n = this.length - 1;

  while (m <= n) {
    const k = (n + m) >> 1;
    if (el > this[k]) m = k + 1;
    else if (el < this[k]) n = k - 1;
    else {
      m = -1;
      n = -2;
    }
  }
  if (m >= 0) this.splice(m, 0, el);

  return this.length;
};

const Shell = function (
  shell: HTMLElement,
  socket: Socket,
  editor: HTMLElement,
  editorToggle: HTMLInputElement,
  iFrame: HTMLFrameElement,
  createInputSpan: boolean
) {
  // Shell is an old-style javascript oop constructor
  // we're using arguments as private variables, cf
  // https://stackoverflow.com/questions/18099129/javascript-using-arguments-for-closure-bad-or-good
  const obj = this; // for nested functions with their own 'this'. or one could use bind, or => functions, but simpler this way
  let htmlSec; // the current place in shell where new stuff gets written
  let inputSpan = null; // the input HTML element at the bottom of the shell. note that inputSpan should always have *one text node*
  const cmdHistory: any = []; // History of commands for shell-like arrow navigation
  cmdHistory.index = 0;
  cmdHistory.sorted = []; // a sorted version
  // input is a bit messy...
  let inputEndFlag = false;
  let procInputSpan = null; // temporary span containing currently processed input
  let inputLineNo = 0; // current input line counter -- not to be confused with lineNumber (prompt)
  let debugPrompt = false; // whether M2 is in debugging mode

  const createHtml = function (className) {
    const cell = className.indexOf("M2Cell") >= 0; // a bit special
    const anc = htmlSec;
    htmlSec = document.createElement(cell ? "div" : "span");
    htmlSec.className = className;
    if (cell) {
      // insert separator above
      const ss = document.createElement("span");
      ss.className = "M2CellBar M2Separator";
      ss.tabIndex = 0;
      htmlSec.appendChild(ss);
      // insert bar at left
      const s = document.createElement("span");
      s.className = "M2CellBar M2Left";
      s.tabIndex = 0;
      htmlSec.appendChild(s);
    }
    if (className.indexOf("M2Text") < 0) htmlSec.dataset.code = "";
    // even M2Html needs to keep track of innerHTML because html tags may get broken
    if (inputSpan && inputSpan.parentElement == anc)
      anc.insertBefore(htmlSec, inputSpan);
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
    if (editor) htmlSec.appendChild(document.createElement("br")); // a bit of extra space doesn't hurt
    // createHtml(webAppClasses[webAppTags.Cell]);
    htmlSec.appendChild(inputSpan);

    inputSpan.focus();

    inputEndFlag = false;
  };

  if (createInputSpan) createInputEl();
  else htmlSec = shell;

  obj.codeInputAction = function (t) {
    t.classList.add("codetrigger");
    if (t.tagName == "CODE") obj.postMessage(t.innerText, false, false);
    else {
      // past input: almost the same but not quite: code not sent, just replaces input
      let str = t.textContent;
      if (str[str.length - 1] == "\n") str = str.substring(0, str.length - 1); // cleaner this way
      // inputSpan.textContent = str;
      // setCaretAtEndMaybe(inputSpan);
      inputSpan.focus();
      document.execCommand("selectAll");
      document.execCommand("insertText", false, str);
      scrollDown(shell);
    }
    setTimeout(() => {
      t.classList.remove("codetrigger");
    }, 100);
  };

  const returnSymbol = "\u21B5";

  const postRawMessage = function (msg: string) {
    socket.emit("input", msg);
  };

  obj.postMessage = function (msg, flag1, flag2) {
    // send input, adding \n if necessary
    removeAutoComplete(false, false); // remove autocomplete menu if open
    removeDelimiterHighlight(htmlSec);
    let clean = sanitizeInput(msg);
    if (clean.length > 0) {
      if (procInputSpan === null) {
        // it'd be nicer to use ::before on inputSpan but sadly caret issues... cf https://stackoverflow.com/questions/60843694/cursor-position-in-an-editable-div-with-a-before-pseudo-element
        procInputSpan = document.createElement("span");
        procInputSpan.classList.add("M2Input");
        inputSpan.parentElement.insertBefore(procInputSpan, inputSpan);
      }
      procInputSpan.textContent += clean + returnSymbol;
      inputSpan.textContent = "";
      scrollDownLeft(shell);
      if (flag2) setCaret(inputSpan, 0);
      clean = clean + "\n";
      if (flag1) obj.addToEditor(clean);
      postRawMessage(clean);
    }
  };

  obj.addToEditor = function (msg) {
    // add command to editor area
    if (typeof msg !== "undefined") {
      if (editor !== null && editor.contentEditable == "true") {
        const span = document.createElement("span");
        span.innerHTML = Prism.highlight(msg, Prism.languages.macaulay2);
        editor.appendChild(span);
        scrollDownLeft(editor);
      }
    }
  };

  const downArrowKeyHandling = function () {
    if (
      inputSpan.textContent.substring(getCaret(inputSpan) || 0).indexOf("\n") <
        0 &&
      cmdHistory.index < cmdHistory.length
    ) {
      cmdHistory.index++;
      inputSpan.textContent =
        cmdHistory.index === cmdHistory.length
          ? cmdHistory.current
          : cmdHistory[cmdHistory.index];
      return true;
    } else return false;
  };

  const upArrowKeyHandling = function () {
    if (
      inputSpan.textContent
        .substring(0, getCaret(inputSpan) || 0)
        .indexOf("\n") < 0 &&
      cmdHistory.index > 0
    ) {
      if (cmdHistory.index === cmdHistory.length)
        cmdHistory.current = inputSpan.textContent;
      cmdHistory.index--;
      inputSpan.textContent = cmdHistory[cmdHistory.index];
      return true;
    } else return false;
  };

  shell.onpaste = function (e) {
    if (!inputSpan) return;
    setCaretAtEndMaybe(inputSpan, true);
    e.preventDefault();
    // paste w/o formatting
    document.execCommand(
      "insertText",
      false,
      e.clipboardData.getData("text/plain")
    );
    scrollDown(shell);
  };

  shell.onclick = function (e) {
    if (!inputSpan || !window.getSelection().isCollapsed) return;
    let t = e.target as HTMLElement;
    while (t != shell) {
      if (
        t.classList.contains("M2CellBar") ||
        t.tagName == "A" ||
        t.classList.contains("M2PastInput")
      )
        return;
      t = t.parentElement;
    }
    setCaretAtEndMaybe(inputSpan, true);
    scrollDown(shell);
  };

  shell.onkeydown = function (e: KeyboardEvent) {
    if (!inputSpan) return;
    removeAutoComplete(false, true); // remove autocomplete menu if open and move caret to right after
    removeDelimiterHighlight(htmlSec);
    if ((e.target as HTMLElement).classList.contains("M2CellBar")) return;
    if (e.key == "Enter" && !e.shiftKey) {
      obj.postMessage(
        inputSpan.textContent,
        editorToggle && editorToggle.checked,
        true
      );
      e.preventDefault(); // no crappy <div></div> added
      return;
    }

    if ((e.key == "ArrowDown" || e.key == "ArrowUp") && !e.shiftKey) {
      if (
        e.key == "ArrowDown" ? downArrowKeyHandling() : upArrowKeyHandling()
      ) {
        e.preventDefault();
        setCaretAtEndMaybe(inputSpan);
        scrollDown(shell);
        //
        return;
      }
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
      // do not move caret on Ctrl/Command combos, PageUp/Down, etc
      if (e.key == "PageUp" && document.activeElement == inputSpan)
        shell.focus();
      // this prevents the annoying behavior of page up going to start of inputSpan
      // requires shell ("terminal") to have tabIndex=0
      return;
    }

    if (e.key == "Home") {
      setCaret(inputSpan, 0); // the default would sometimes use this for vertical scrolling
      scrollDownLeft(shell);
      return;
    }

    if (e.key == "End") {
      setCaretAtEndMaybe(inputSpan); // the default would sometimes use this for vertical scrolling
      scrollDown(shell);
      return;
    }

    // auto-completion code
    if (e.key == "Tab") {
      // try to avoid disrupting the normal tab use as much as possible
      if (
        document.activeElement == inputSpan &&
        !e.shiftKey &&
        autoCompleteHandling(null)
      ) {
        scrollDown(shell);
        e.preventDefault();
      }
      return;
    }
    if (
      e.key == "ArrowRight" &&
      !e.shiftKey &&
      document.activeElement == inputSpan
    ) {
      const pos = window.getSelection().focusOffset;
      if (
        pos == inputSpan.textContent.length &&
        autoCompleteHandling(null, cmdHistory.sorted)
      ) {
        scrollDown(shell);
        e.preventDefault();
        return;
      }
    }

    setCaretAtEndMaybe(inputSpan, true);
    const pos = window.getSelection().focusOffset;
    if (pos == 0) scrollLeft(shell);

    if (e.key == "Escape") {
      scrollDown(shell);
      escapeKeyHandling();
      e.preventDefault();
      return;
    }
  };

  /*
  inputSpan.oninput = function (e) {
    if (
      inputSpan.parentElement == htmlSec &&
      htmlSec.classList.contains("M2Input")
    )
      delayedHighlight(htmlSec);
      // multiple problems: 
      // the test should be when hiliting, not delayed!!!!
      // more importantly, Prism breaks existing HTML and that's fatal for inputSpan
  };
*/

  shell.oninput = function () {
    if (!inputSpan) return;
    if (
      inputSpan.parentElement == htmlSec &&
      htmlSec.classList.contains("M2Input")
    )
      delimiterHandling(htmlSec);
    // the negation of the first only happens in transitional state; of the second if we turned off webapp mode
    // in both cases it's simpler to deactivate highlighting

    if (
      document.activeElement == inputSpan &&
      window.getSelection().focusOffset == 0
    )
      scrollLeft(shell);
  };

  const subList = [];

  const recurseReplace = function (container, str, el) {
    for (let i = 0; i < container.childNodes.length; i++) {
      const sub = container.childNodes[i];
      if (sub.nodeType === 3) {
        const pos = sub.textContent.indexOf(str);
        if (pos >= 0) {
          const rest = sub.textContent.substring(pos + str.length);
          const next = sub.nextSibling; // really, #i+1 except if last
          if (pos > 0) {
            sub.textContent = sub.textContent.substring(0, pos);
            container.insertBefore(el, next);
          } else container.replaceChild(el, sub);
          if (rest.length > 0)
            container.insertBefore(document.createTextNode(rest), next);
          return true;
        }
      } else if (sub.nodeType === 1) {
        if (recurseReplace(sub, str, el)) return true;
      }
    }
    return false;
  };

  const closeHtml = function () {
    const anc = htmlSec.parentElement;

    if (htmlSec.classList.contains("M2Input"))
      anc.appendChild(document.createElement("br")); // this first for spacing purposes

    if (htmlSec.contains(inputSpan)) attachElement(inputSpan, anc);
    // move back input element to outside htmlSec

    if (
      htmlSec.classList.contains("M2Cell") &&
      htmlSec.childNodes.length == 2
    ) {
      // reject empty cells
      htmlSec.remove();
      htmlSec = anc;
      return;
    }

    if (
      htmlSec.classList.contains("M2Prompt") &&
      htmlSec.parentElement.parentElement == shell
    ) {
      const txt = htmlSec.textContent;
      if (txt.startsWith("i")) debugPrompt = txt.startsWith("ii");
    } else if (htmlSec.classList.contains("M2Error")) {
      const txt = htmlSec.textContent;
      const m = txt.match(
        //        /(stdio)(?::(\d+)(?::(\d+)|)(?:-(\d+)(?::(\d+)|)|)|)/
        /stdio:(\d+):(\d+)/
      );
      if (m) {
        // experimental: highlight error? for now only stdio
        const nodeOffset = obj.locateStdio(+m[1], +m[2]);
        if (nodeOffset) {
          const marker = addMarker(nodeOffset[0], nodeOffset[1]);
          marker.classList.add("caret-marker");
          if (txt.match(/syntax error|missing/)) {
            // TEMP, obviously
            nodeOffset[2].dataset.errorColumn = nodeOffset[3] + 1; // +1 because includes the character that triggered error
            inputLineNo--;
          }
        }
      } else if (txt.startsWith("Macaulay2, version")) {
        // TEMP, obviously
        inputLineNo = 0;
        // remove all past line numbers
        Array.from(shell.querySelectorAll(".M2PastInput[data-lines]")).forEach(
          (x) => x.removeAttribute("data-lines")
        );
      }
    } else if (htmlSec.classList.contains("M2Input")) {
      if (htmlSec.parentElement.parentElement == shell) {
        // eww
        // add input to history
        let txt = htmlSec.textContent;
        if (txt[txt.length - 1] == "\n") txt = txt.substring(0, txt.length - 1); // should be true
        if (htmlSec.classList.contains("M2InputContd"))
          // rare case where input is broken
          cmdHistory[cmdHistory.length - 1] += "\n" + txt;
        else cmdHistory.index = cmdHistory.push(txt);
        if (!debugPrompt) {
          // number and record individual lines
          let s = " ";
          txt.split("\n").forEach((line) => {
            line = line.trim();
            if (line.length > 0) cmdHistory.sorted.sortedPush(line);
            inputLineNo++;
            s = s + inputLineNo + " ";
          });
          htmlSec.dataset.lines = s;
        }
      }
      // highlight
      htmlSec.innerHTML = Prism.highlight(
        htmlSec.textContent,
        Prism.languages.macaulay2
      );
      htmlSec.classList.add("M2PastInput");
    } else if (htmlSec.classList.contains("M2Url")) {
      let url = htmlSec.dataset.code.trim();
      console.log("Opening URL " + url);
      if (
        !iFrame ||
        (window.location.protocol == "https:" && url.startsWith("http://")) // no insecure in frame
      )
        window.open(url, "M2 browse");
      else if (url.startsWith("#")) document.location.hash = url;
      else {
        const url1 = new URL(url, "file://");
        if (!url1.searchParams.get("user"))
          url1.searchParams.append("user", clientId); // should we exclude "public"?
        url = url1.toString();
        if (url.startsWith("file://")) url = url.slice(7);
        iFrame.src = url;
      }
    } else if (htmlSec.classList.contains("M2Html")) {
      htmlSec.insertAdjacentHTML("beforeend", htmlSec.dataset.code);
      autoRender(htmlSec);
      if (htmlSec.dataset.idList) {
        htmlSec.dataset.idList.split(" ").forEach(function (id) {
          const el = document.getElementById("sub" + id);
          if (el) {
            if (el.style.color == "transparent") subList[+id][1].remove();
            // e.g. inside \vphantom{}
            else {
              el.style.display = "contents"; // could put in css but don't want to overreach
              el.style.fontSize = "0.826446280991736em"; // to compensate for katex's 1.21 factor
              el.innerHTML = "";
              el.appendChild(subList[+id][1]);
            }
          } else {
            // more complicated
            if (!recurseReplace(htmlSec, subList[+id][0], subList[+id][1]))
              console.log("Error restoring html element");
          }
        });
        htmlSec.removeAttribute("data-id-list");
      }
    }
    htmlSec.removeAttribute("data-code");
    if (anc.classList.contains("M2Html") && anc.dataset.code != "") {
      // stack
      // in case it's inside TeX, we compute dimensions
      // 18mu= 1em * mathfont size modifier, here 1.21 factor of KaTeX
      const fontSize: number =
        +window
          .getComputedStyle(htmlSec, null)
          .getPropertyValue("font-size")
          .split("px", 1)[0] * 1.21;
      const baseline: number = baselinePosition(htmlSec);
      const str =
        "\\htmlId{sub" +
        subList.length +
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
      anc.dataset.code += str;
      if (!anc.dataset.idList) anc.dataset.idList = subList.length;
      else anc.dataset.idList += " " + subList.length;
      subList.push([str, htmlSec]);
    }
    htmlSec = anc;
  };

  obj.displayOutput = function (msg: string) {
    if (procInputSpan !== null) {
      procInputSpan.remove();
      procInputSpan = null;
    }
    const txt = msg.replace(/\r/g, "").split(webAppRegex);
    for (let i = 0; i < txt.length; i += 2) {
      //console.log(i+"-"+(i+1)+"/"+txt.length+": ",i==0?"":webAppClasses[txt[i-1]]," : ",txt[i].replace("\n",returnSymbol));
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
          tag == webAppTags.CellEnd ||
          tag == webAppTags.ErrorEnd
        ) {
          if (htmlSec != shell || !createInputSpan) {
            // htmlSec == shell should only happen at very start
            // or at the very end for rendering help -- then it's OK
            while (htmlSec.classList.contains("M2Input")) closeHtml(); // M2Input is *NOT* closed by end tag but rather by \n
            // but in rare circumstances (interrupt) it may be missing its \n
            if (
              tag != webAppTags.ErrorEnd ||
              htmlSec.classList.contains("M2Error")
            ) {
              // error end tags are sometimes redundant, must be ignored :/
              if (
                htmlSec.classList.contains("M2Cell") !=
                (tag == webAppTags.CellEnd)
              )
                console.log("Warning: end tag mismatch");
              closeHtml();
            }
          }
        } else if (tag === webAppTags.InputContd && inputEndFlag) {
          // continuation of input section
          inputEndFlag = false;
        } else {
          // new section
          createHtml(webAppClasses[tag]);
          if (
            inputSpan &&
            (tag === webAppTags.Input || tag === webAppTags.InputContd)
          ) {
            // input section: a bit special (ends at first \n)
            attachElement(inputSpan, htmlSec); // !!! we move the input inside the current span to get proper indentation !!!
          }
        }
      }

      if (txt[i].length > 0) {
        // for next round, check if we're nearing the end of an input section
        if (htmlSec.classList.contains("M2Input")) {
          const ii = txt[i].indexOf("\n");
          if (ii >= 0) {
            if (ii < txt[i].length - 1) {
              // need to do some surgery
              displayText(txt[i].substring(0, ii + 1));
              closeHtml();
              txt[i] = txt[i].substring(ii + 1, txt[i].length);
            } else inputEndFlag = true;
            // can't tell for sure if it's the end of input or not (could be a InputContd), so set a flag to remind us
          }
        }

        if (htmlSec.dataset.code !== undefined) htmlSec.dataset.code += txt[i];
        else displayText(txt[i]);
        //          if (l.contains("M2Html")) htmlSec.innerHTML = htmlSec.dataset.code; // used to update in real time
        // all other states are raw text -- don't rewrite htmlSec.textContent+=txt[i] in case of input
      }
    }
    scrollDownLeft(shell);
  };

  const displayText = function (msg) {
    const node = document.createTextNode(msg);
    if (inputSpan && inputSpan.parentElement == htmlSec)
      htmlSec.insertBefore(node, inputSpan);
    else htmlSec.appendChild(node);
  };

  obj.reset = function () {
    console.log("Reset");
    removeAutoComplete(false, false); // remove autocomplete menu if open
    createInputEl(); // recreate the input area

    //    htmlSec.parentElement.insertBefore(document.createElement("hr"), htmlSec); // insert an additional horizontal line to distinguish successive M2  runs
  };

  obj.interrupt = function () {
    removeAutoComplete(false, false); // remove autocomplete menu if open
    inputSpan.textContent = "";
    removeDelimiterHighlight(htmlSec);
    postRawMessage("\x03");
    setCaretAtEndMaybe(inputSpan);
  };

  obj.locateStdio = function (row: number, column: number) {
    // find relevant input from stdio:row:column
    let query = '.M2PastInput[data-lines*=" ' + row + ' "]';
    const pastInputs = shell.querySelectorAll(query) as NodeListOf<HTMLElement>;
    if (pastInputs.length == 0) return null;

    let row0 = +pastInputs[0].dataset.lines.match(/ \d+ /)[0];
    let txt = "";
    for (let i = 0; i < pastInputs.length; i++)
      txt +=
        pastInputs[i].dataset.errorColumn !== undefined
          ? pastInputs[i].innerText.substring(
              0,
              +pastInputs[i].dataset.errorColumn
            )
          : pastInputs[i].innerText;
    let offset = locateRowColumn(txt, row - row0 + 1, column);
    if (offset === null) return null;

    let i = 0;
    while (i < pastInputs.length) {
      const len =
        pastInputs[i].dataset.errorColumn !== undefined
          ? +pastInputs[i].dataset.errorColumn
          : pastInputs[i].innerText.length; // should only happen for last one
      if (offset < len) {
        const nodeOffset = locateOffset(pastInputs[i], offset);
        if (nodeOffset)
          // should always be true
          return [nodeOffset[0], nodeOffset[1], pastInputs[i], offset]; // node, offset in node, element, offset in element
      }
      offset -= len;
      i++;
    }
  };

  obj.selectPastInput = function (rowcols) {
    const nodeOffset1 = obj.locateStdio(rowcols[0], rowcols[1]);
    if (!nodeOffset1) return;
    const nodeOffset2 = obj.locateStdio(rowcols[2], rowcols[3]);
    if (!nodeOffset2 || nodeOffset2[2] != nodeOffset1[2]) return;
    const sel = window.getSelection();
    sel.setBaseAndExtent(
      nodeOffset1[0],
      nodeOffset1[1],
      nodeOffset2[0],
      nodeOffset2[1]
    );
    const marker = addMarker(nodeOffset2[0], nodeOffset2[1]);
    if (rowcols[0] == rowcols[2] && rowcols[1] == rowcols[3])
      marker.classList.add("caret-marker");
    marker.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "end",
    });
  };

  if (inputSpan)
    window.addEventListener("load", function () {
      inputSpan.focus();
    });
};

export { Shell };
