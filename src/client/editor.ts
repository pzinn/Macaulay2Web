// contains functions used by both terminal and editor
import { setupMenu } from "./menu";
import M2symbols from "./prism-M2";
import {
  getCaret,
  getCaret2,
  setCaret,
  forwardCaret,
  addMarkerEl,
} from "./htmlTools";
import { webAppRegex } from "../common/tags";
import Prism from "prismjs";

// partial support for unicode symbols
// symbols are ordered; from most useful to least
// prettier-ignore
const UCsymbols = {
    "Alpha": 0x391, "Beta": 0x392, "Chi": 0x3a7, "Delta": 0x394, "Epsilon": 0x395, "Eta": 0x397, "Gamma": 0x393, "Iota": 0x399, "Kappa": 0x39a, "Lambda": 0x39b, "Mu": 0x39c, "Nu": 0x39d, "Omega": 0x3a9, "Omicron": 0x39f, "Phi": 0x3a6, "Pi": 0x3a0, "Psi": 0x3a8, "Rho": 0x3a1, "Sigma": 0x3a3, "Tau": 0x3a4, "Theta": 0x398, "Upsilon": 0x3a5, "Xi": 0x39e, "Zeta": 0x396, "alpha": 0x3b1, "beta": 0x3b2, "chi": 0x3c7, "delta": 0x3b4, "epsilon": 0x3f5, "eta": 0x3b7, "gamma": 0x3b3, "iota": 0x3b9, "kappa": 0x3ba, "lambda": 0x3bb, "mu": 0x3bc, "nu": 0x3bd, "omega": 0x3c9, "omicron": 0x3bf, "phi": 0x3d5, "pi": 0x3c0, "psi": 0x3c8, "rho": 0x3c1, "sigma": 0x3c3, "tau": 0x3c4, "theta": 0x3b8, "upsilon": 0x3c5, "varepsilon": 0x3b5, "varphi": 0x3c6, "varpi": 0x3d6, "varrho": 0x3f1, "varsigma": 0x3c2, "vartheta": 0x3d1, "xi": 0x3be, "zeta": 0x3b6,
    "CC": 0x2102, "HH": 0x210d, "NN": 0x2115, "PP": 0x2119, "QQ": 0x211a, "RR": 0x211d,  "ZZ": 0x2124,
    "tensor": 0x2297, "**": 0x2297, "leftarrow": 0x2190, "<-": 0x2190, "rightarrow": 0x2192, "->": 0x2192, "doublerightarrow": 0x21D2, "=>": 0x21D2, "notequal": 0x2260, "!=": 0x2260, "directsum": 0x2295, "++": 0x2295, "muchless": 0x226A, "<<": 0x226A, "muchmore": 0x226B, ">>": 0x226B, "all": 0x2200, "any": 0x2203, "member": 0x2208, "sum": 0x2211, "product": 0x220F, "sqrt": 0x221A, "infinity": 0x221e, "and": 0x2227, "or": 0x2228, "integral": 0x222B, "lessorequal": 0x2264, "<=": 0x2264, "greaterorequal": 0x2265, ">=": 0x2265, "righttack": 0x22A2,
    "Im": 0x2111, "Re": 0x211c, "nabla": 0x2207, "wp": 0x2118,
    "afrak": 120094, "bfrak": 120095, "cfrak": 120096, "dfrak": 120097, "efrak": 120098, "ffrak": 120099, "gfrak": 120100, "hfrak": 120101, "ifrak": 120102, "jfrak": 120103, "kfrak": 120104, "lfrak": 120105, "mfrak": 120106, "nfrak": 120107, "ofrak": 120108, "pfrak": 120109, "qfrak": 120110, "rfrak": 120111, "sfrak": 120112, "tfrak": 120113, "ufrak": 120114, "vfrak": 120115, "wfrak": 120116, "xfrak": 120117, "yfrak": 120118, "zfrak": 120119,
    "Afrak": 120068, "Bfrak": 120069, "Cfrak": 120070, "Dfrak": 120071, "Efrak": 120072, "Ffrak": 120073, "Gfrak": 120074, "Hfrak": 120075, "Ifrak": 120076, "Jfrak": 120077, "Kfrak": 120078, "Lfrak": 120079, "Mfrak": 120080, "Nfrak": 120081, "Ofrak": 120082, "Pfrak": 120083, "Qfrak": 120084, "Rfrak": 120085, "Sfrak": 120086, "Tfrak": 120087, "Ufrak": 120088, "Vfrak": 120089, "Wfrak": 120090, "Xfrak": 120091, "Yfrak": 120092, "Zfrak": 120093, // this is slightly wrong because C, H, I, R don't exist
    "ell": 0x2113, "hbar": 0x210f,
    "aleph": 0x2135, "beth": 0x2136, "gimel": 0x2137, "daleth": 0x2138,
    "'a": 0x00e1, "'A": 0x00c1, "'e": 0x00e9, "'E": 0x00c9, "'i": 0x00ed, "'I": 0x00cd, "'o": 0x00f3, "'O": 0x00d3, "'u": 0x00fa, "'U": 0x00da, "'y": 0x00fd, "'Y": 0x00dd,
    "^a": 0x00e2, "^A": 0x00c2, "^e": 0x00ea, "^E": 0x00ca, "^i": 0x00ee, "^I": 0x00ce, "^o": 0x00f4, "^O": 0x00d4, "^u": 0x00fb, "^U": 0x00db,
    "\"a": 0x00e4, "\"A": 0x00c4, "\"e": 0x00eb, "\"E": 0x00cb, "\"i": 0x00ef, "\"I": 0x00cf, "\"o": 0x00f6, "\"O": 0x00d6, "\"u": 0x00fc, "\"U": 0x00dc,
    "`a": 0x00e0, "`A": 0x00c0, "`e": 0x00e8, "`E": 0x00c8, "`i": 0x00ec, "`I": 0x00cc, "`o": 0x00f2, "`O": 0x00d2, "`u": 0x00f9, "`U": 0x00d9,
    "~a": 0x00e3, "~A": 0x00c3, "~n": 0x00f1, "~N": 0x00d1, "~o": 0x00f5, "~O": 0x00d5, "cc": 0x00e7, "cC": 0x00c7,
    "\n": 0xa
};

const UCsymbolKeys = Object.keys(UCsymbols).sort();
//const UCsymbolValues = Object.values(UCsymbols)
//  .map((i) => String.fromCodePoint(i))
//  .join("");
//const sanitizeRegEx = new RegExp("[^ -~" + UCsymbolValues + "]", "g"); // a bit too restrictive?
const sanitizeInput = function (msg: string) {
  // sanitize input
  //  return msg.replace(sanitizeRegEx, "").replace(/\n+$/, "");
  return msg.replace(webAppRegex, "").replace(/\n+$/, "");
};

const escapeKeyHandling = function () {
  // for now assume it's a single text node???
  const sel = window.getSelection();
  const node = sel.focusNode; // or anchorNode? start vs end of selection
  let pos = sel.focusOffset;
  let esc = node.textContent.indexOf("\u250B");
  if (esc < 0) document.execCommand("insertText", false, "\u250B");
  else {
    let s;
    if (esc < pos) {
      s = node.textContent.substring(esc + 1, pos);
      while (esc < pos) {
        document.execCommand("delete");
        pos--;
      }
      /*
        node.textContent =
          node.textContent.substring(0, esc) +
          node.textContent.substring(pos, node.textContent.length);
        pos = esc;
	    */
    } else {
      s = node.textContent.substring(pos, esc);
      /*
        node.textContent =
          node.textContent.substring(0, pos) +
          node.textContent.substring(
            esc + 1,
            node.textContent.length
            );*/
      while (pos <= esc) {
        document.execCommand("forwardDelete");
        esc--;
      }
    }
    if (s.length == 0) return;
    // special: matrix
    const m = s.match(/^(\d)(\d)$/);
    if (m) {
      let row = "<tr>";
      for (let i = 0; i < +m[2]; i++) row += "<td>0</td>";
      row += "</tr>";
      let table = "<table class='inputMatrix'><tbody>";
      for (let i = 0; i < +m[1]; i++) table += row;
      table += "</table></tbody>";
      document.execCommand("insertHTML", false, table);
      return;
    }
    if (s == "_") {
      document.execCommand(
        "insertHTML",
        false,
        "<sub id='tmp' class='inputSu'></sub>"
      );
      const el = document.getElementById("tmp");
      setCaret(el, 0);
      el.removeAttribute("id");
      return;
    }
    if (s == "^") {
      document.execCommand(
        "insertHTML",
        false,
        "<sup id='tmp' class='inputSu'></sup>"
      );
      const el = document.getElementById("tmp");
      setCaret(el, 0);
      el.removeAttribute("id");
      return;
    }

    for (const ss in UCsymbols) {
      if (ss.startsWith(s)) {
        document.execCommand(
          "insertText",
          false,
          String.fromCodePoint(UCsymbols[ss])
        );
        return;
      }
    }
  }
};

let autoComplete = null; // autocomplete HTML element (when tab is pressed)
let autoCompleteNode = null; // where it sits
let autoCompleteEl = null; // ancestor element (editor) for hiliting

const removeAutoComplete = function (autoCompleteSelection, caret: boolean) {
  // null or the menu element to insert
  if (autoComplete) {
    const autoComplete1 = autoComplete;
    autoComplete = null; // to avoid loops...
    let pos = autoCompleteNode.textContent.length;
    let s = autoComplete1.dataset.word;
    if (autoCompleteSelection) s = autoCompleteSelection.dataset.fullword;
    pos += s.length;
    s += autoComplete1.lastChild.textContent;
    autoComplete1.remove();
    autoCompleteNode.textContent += s; // not ctrl-Z friendly
    if (caret) {
      // place the caret where it should
      const sel = window.getSelection();
      sel.collapse(autoCompleteNode, pos);
    }
    if (autoCompleteEl) syntaxHighlight(autoCompleteEl); // redo the highlighting
  }
};

const autoCompleteHandling = function (el, dictionary?) {
  if (autoComplete) return; // normally should never happen
  autoCompleteEl = el;
  const sel = window.getSelection();
  autoCompleteNode = sel.focusNode; // or anchorNode? start vs end of selection
  let pos = sel.focusOffset;
  const msg = autoCompleteNode.textContent;
  let i = -1;
  if (!dictionary) {
    i = pos - 1;
    while (
      i >= 0 &&
      ((msg[i] >= "A" && msg[i] <= "Z") ||
        (msg[i] >= "a" && msg[i] <= "z") ||
        (msg[i] >= "0" && msg[i] <= "9"))
    )
      i--; // would be faster with regex
  }
  const word = msg.substring(i + 1, pos);
  if (word == "") return false; // signal so can interpret tab some other way
  const flag = i < 0 || msg[i] != "\u250B";
  if (flag) i++; // !flag => include the escape symbol
  const lst = dictionary ? dictionary : flag ? M2symbols : UCsymbolKeys;

  // find all symbols starting with last word of msg
  let j = 0;
  while (j < lst.length && lst[j] < word) j++;
  if (j < lst.length) {
    let k = j;
    while (k < lst.length && lst[k].startsWith(word)) k++;
    if (k > j) {
      if (k == j + 1) {
        // yay, one solution
        if (flag) {
          let ins = lst[j].substring(word.length, lst[j].length);
          if (!dictionary) ins += " ";
          document.execCommand("insertText", false, ins);
        } else {
          while (i < pos) {
            document.execCommand("delete");
            pos--;
          }
          document.execCommand(
            "insertText",
            false,
            String.fromCharCode(UCsymbols[lst[j]])
          );
        }
      } else {
        // more interesting: several solutions
        // obvious implementation would've been datalist + input;
        // sadly, the events generated by the input are 200% erratic, so can't use
        autoComplete = document.createElement("span");
        //          autoComplete.id="autocomplete";
        autoComplete.dataset.word = flag ? word : "\u250B" + word;
        const tabMenu = document.createElement("ul");
        tabMenu.classList.add("menu");
        tabMenu.tabIndex = 0;
        for (let l = j; l < k; l++) {
          const opt = document.createElement("li");
          const wordb = document.createElement("b");
          wordb.textContent = word;
          opt.append(wordb, lst[l].substring(word.length, lst[l].length));
          opt.dataset.fullword = flag
            ? !dictionary
              ? lst[l] + " "
              : lst[l]
            : String.fromCharCode(UCsymbols[lst[l]]);
          if (dictionary) {
            const icon = document.createElement("i");
            icon.classList.add("material-icons");
            icon.textContent = "close";
            icon.style.fontSize = "0.8em";
            icon.style.float = "right";
            icon.onclick = function (e) {
              // can't use l, may have shifted
              let m = j;
              while (
                m < dictionary.length &&
                dictionary[m] != opt.dataset.fullword
              )
                m++;
              if (m < dictionary.length) dictionary.splice(m, 1);
              opt.remove();
              e.stopPropagation();
              if (tabMenu.childElementCount == 0)
                removeAutoComplete(false, true); // no choice => back to normal typing
            };
            opt.appendChild(icon);
          }
          tabMenu.appendChild(opt);
        }
        autoComplete.appendChild(tabMenu);
        autoComplete.appendChild(
          document.createTextNode(autoCompleteNode.textContent.substring(pos))
        );
        autoCompleteNode.textContent = autoCompleteNode.textContent.substring(
          0,
          i
        ); // not ctrl-Z friendly
        autoComplete.contentEditable = false; // for focus issues
        autoCompleteNode.parentElement.insertBefore(
          autoComplete,
          autoCompleteNode.nextSibling
        );
        const menuSel = setupMenu(tabMenu, removeAutoComplete, (e) => {
          // keydown event
          if (e.key == "Shift") {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (e.key.length == 1 && e.key >= " " && e.key <= "~") {
            let lostSelection = false;
            Array.from(tabMenu.children).forEach((el) => {
              if (
                el.lastChild.textContent.length > 0 &&
                el.lastChild.textContent[0] == e.key
              ) {
                el.firstChild.textContent += e.key;
                el.lastChild.textContent =
                  el.lastChild.textContent.substring(1);
              } else {
                if (el.classList.contains("selected")) lostSelection = true;
                el.remove();
              }
            });
            if (tabMenu.childElementCount == 0) return; // no choice => back to normal typing
            autoComplete.dataset.word += e.key;
            if (tabMenu.childElementCount == 1)
              removeAutoComplete(tabMenu.firstChild, true);
            if (lostSelection) menuSel(tabMenu.firstElementChild);
            e.preventDefault();
            e.stopPropagation();
          }
        });
      }
    }
  }
  return true;
};

/*
const removeDelimiterHighlight = function (el) {
  el.removeAttribute("data-highlight");
  el.removeAttribute("data-highlight-error");
};
*/

const openingDelimiters = "([{";
const closingDelimiters = ")]}";

const delimiterHandling = function (el) {
  const sel = window.getSelection();
  if (!sel.isCollapsed) return;
  const pos = sel.anchorOffset;
  if (pos == 0) return;
  const key = sel.anchorNode.textContent[pos - 1];
  if (key == '"') {
    quoteHandling(key, el);
    return;
  }
  let index = closingDelimiters.indexOf(key);
  if (index >= 0) {
    closingDelimiterHandling(index, el);
    return;
  }
  index = openingDelimiters.indexOf(key);
  if (index >= 0) {
    openingDelimiterHandling(index, el);
    return;
  }
};

// quotes need to be treated separately
const quoteHandling = function (quote, el) {
  const pos = getCaret(el) - 1;
  const input = el.innerText;
  if (pos > 0 && input[pos - 1] == "\\") return true; // \" does not trigger highlighting
  let flag = true;
  let last = -1;
  let i;
  for (i = 0; i < pos; i++)
    if (input[i] == quote && (i == 0 || input[i - 1] != "\\")) {
      flag = !flag;
      last = i;
    }
  if (flag) return true; // opening " -- does not try to check, too confusing
  // otherwise, closing "
  addMarkerEl(el, last).classList.add("valid-marker");
  //	marker.dataset.content=quote;
  addMarkerEl(el, pos).classList.add("valid-marker");
  //	marker.dataset.content=quote;
  setCaret(el, pos + 1);
  return true;
};

const closingDelimiterHandling = function (index, el) {
  const pos = getCaret(el) - 1;

  const input = el.innerText;
  let i, j;
  const depth = [];
  for (i = 0; i < openingDelimiters.length; i++) depth.push(i == index ? 1 : 0);
  i = pos;
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
    addMarkerEl(el, i).classList.add("valid-marker");
    addMarkerEl(el, pos).classList.add("valid-marker");
  } else addMarkerEl(el, pos).classList.add("error-marker");
  setCaret(el, pos + 1);
  return true;
};

const openingDelimiterHandling = function (index, el) {
  const pos = getCaret(el) - 1;
  const input = el.innerText;
  let i, j;
  const depth = [];
  for (i = 0; i < openingDelimiters.length; i++) depth.push(i == index ? 1 : 0);
  i = pos;
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
    addMarkerEl(el, pos).classList.add("valid-marker");
    addMarkerEl(el, i).classList.add("valid-marker");
  } // we never throw an error on an opening delimiter -- it's assumed more input is coming
  setCaret(el, pos + 1);
  return true;
};

const M2indent = 4;

const delimLevel = function (s, start, end) {
  let level = 0;
  for (let k = start; k < end; k++) {
    if (openingDelimiters.indexOf(s[k]) >= 0) level++;
    else if (closingDelimiters.indexOf(s[k]) >= 0) level--;
  }
  return level;
};

const autoIndent = function (el) {
  //  const t = Date.now();
  const input = el.innerText;
  const sel = window.getSelection() as any;
  let pos = getCaret2(el); // start and end
  if (pos === null) return;
  const oldOnInput = el.oninput;
  el.oninput = null; // turn off delimiter handling or whatever else is oninput
  if (pos[0] > pos[1]) pos = [pos[1], pos[0]];
  const indStart = input.lastIndexOf("\n", pos[0] - 1) + 1; // points to first character of first selected line in input
  let indEnd = input.indexOf("\n", Math.max(pos[0], pos[1] - 1)); // points to \n at the end of last line
  if (indEnd < 0) indEnd = input.length; // or length if no \n
  // we need the previous line
  let pos0 = input.lastIndexOf("\n", indStart - 2) + 1;
  // ... and count its indentation
  let indent = 0;
  while (pos0 < indStart - 1) {
    if (input[pos0] == " ") indent++;
    else if (input[pos0] == "\t") indent = (Math.floor(indent / 8) + 1) * 8;
    else break; // other exotic spaces?
    pos0++;
  }
  indent += delimLevel(input, pos0, indStart - 1) * M2indent; // if (indent<0) indent=0;
  let pos1 = indStart; // keep track of current position in input
  sel.collapseToStart();
  let caretPos = pos[0]; // keep track of caret position
  let shift = 0; // shift between input and actual content of editor due to inserts/deletes
  while (true) {
    let pos3 = input.indexOf("\n", pos1);
    if (pos3 < 0 || pos3 > indEnd) pos3 = indEnd;
    let pos2 =
      pos1 +
      input.substring(pos1, Math.min(pos1 + indent, pos3)).match("^ *")[0]
        .length; // keep spaces that are already there
    let badSpaces = input.substring(pos2, pos3).match("^\\s*")[0].length;
    const indentLeft = indent - pos2 + pos1;
    if (badSpaces > 0 || indentLeft > 0) {
      if (caretPos != pos2 + shift) {
        if (pos2 + shift > caretPos) forwardCaret(el, pos2 + shift - caretPos);
        else setCaret(el, pos2 + shift);
        caretPos = pos2 + shift;
      }
      // remove spaces that shouldn't be there
      shift -= badSpaces;
      pos2 += badSpaces;
      while (badSpaces > 0) {
        document.execCommand("forwardDelete", false);
        badSpaces--;
      }
      // add extra if necessary
      if (indentLeft > 0) {
        document.execCommand("insertText", false, " ".repeat(indentLeft));
        shift += indentLeft;
        caretPos += indentLeft;
      }
    }
    badSpaces = input.substring(pos2, pos3).match("\\s*$")[0].length;
    const pos4 = pos3 - badSpaces;
    if (badSpaces > 0) {
      // because.
      if (caretPos != pos3 - badSpaces + shift) {
        if (pos3 - badSpaces + shift > caretPos)
          forwardCaret(el, pos3 - badSpaces + shift - caretPos);
        else setCaret(el, pos3 - badSpaces + shift);
        caretPos = pos3 - badSpaces + shift;
      }
      shift -= badSpaces;
      while (badSpaces > 0) {
        document.execCommand("forwardDelete", false);
        badSpaces--;
      }
    }
    if (pos3 + 1 >= indEnd) break;
    indent += delimLevel(input, pos2, pos4) * M2indent; // if (indent<0) indent=0;
    pos1 = pos3 + 1; // start of next line
  }
  //  console.log(Date.now() - t);
  el.oninput = oldOnInput;
};

const syntaxHighlight = function (el: HTMLElement) {
  if (autoComplete) return; // no highlighting while autocomplete menu is on, would make a mess!!
  // sadly, never happens -- oninput sucks

  const sel = window.getSelection();
  if (sel.isCollapsed) {
    // to simplify (TEMP?) no hiliting while selecting
    const caret = getCaret(el);
    const newHTML = Prism.highlight(
      htmlToM2(el).innerText,
      Prism.languages.macaulay2
    );
    if (el.innerHTML != newHTML) {
      // avoid changing things if not necessary
      el.innerHTML = newHTML;
      if (caret)
        // note that it could be zero but that's OK (I think)
        setCaret(el, caret);
    }
  }
};

const updateAndHighlightMaybe = function (
  el: HTMLElement,
  txt: string,
  fileName: string
) {
  el.contentEditable = "true";
  // different: replace content
  if (fileName.endsWith(".m2"))
    el.innerHTML = Prism.highlight(txt, Prism.languages.macaulay2);
  else el.textContent = txt;
};

const htmlToM2 = function (el: HTMLElement) {
  // minimal conversion: tables turn into matrices, maybe sub/superscripts...
  Array.from(el.querySelectorAll("table")).forEach((x: HTMLElement) => {
    // not get element by class name because it creates live lists
    x.replaceWith(
      "matrix{" +
        Array.from(x.querySelectorAll("tr"))
          .map(
            (y: HTMLElement) =>
              "{" +
              Array.from(y.querySelectorAll("td,th"))
                .map((z: HTMLElement) => z.textContent)
                .join() +
              "}"
          )
          .join() +
        "}"
    );
  });
  Array.from(el.querySelectorAll("sub")).forEach((x: HTMLElement) =>
    x.replaceWith("_(" + x.textContent + ")")
  );
  Array.from(el.querySelectorAll("sup")).forEach((x: HTMLElement) =>
    x.replaceWith("^(" + x.textContent + ")")
  );
  return el;
};

export {
  escapeKeyHandling,
  autoCompleteHandling,
  removeAutoComplete,
  sanitizeInput,
  delimiterHandling,
  syntaxHighlight,
  updateAndHighlightMaybe,
  autoIndent,
  htmlToM2,
};
