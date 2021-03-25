// contains functions used by both terminal and editor
import { setupMenu } from "./menu";
import M2symbols from "./prism-M2";
import { getCaret, setCaret } from "./htmlTools";
import Prism from "prismjs";

// partial support for unicode symbols
// symbols are ordered; from most useful to least
// prettier-ignore
const UCsymbols = {
      "Alpha": 0x391, "Beta": 0x392, "Chi": 0x3a7, "Delta": 0x394, "Epsilon": 0x395, "Eta": 0x397, "Gamma": 0x393, "Iota": 0x399, "Kappa": 0x39a, "Lambda": 0x39b, "Mu": 0x39c, "Nu": 0x39d, "Omega": 0x3a9, "Omicron": 0x39f, "Phi": 0x3a6, "Pi": 0x3a0, "Psi": 0x3a8, "Rho": 0x3a1, "Sigma": 0x3a3, "Tau": 0x3a4, "Theta": 0x398, "Upsilon": 0x3a5, "Xi": 0x39e, "Zeta": 0x396, "alpha": 0x3b1, "beta": 0x3b2, "chi": 0x3c7, "delta": 0x3b4, "epsilon": 0x3f5, "eta": 0x3b7, "gamma": 0x3b3, "iota": 0x3b9, "kappa": 0x3ba, "lambda": 0x3bb, "mu": 0x3bc, "nu": 0x3bd, "omega": 0x3c9, "omicron": 0x3bf, "phi": 0x3d5, "pi": 0x3c0, "psi": 0x3c8, "rho": 0x3c1, "sigma": 0x3c3, "tau": 0x3c4, "theta": 0x3b8, "upsilon": 0x3c5, "varepsilon": 0x3b5, "varphi": 0x3c6, "varpi": 0x3d6, "varrho": 0x3f1, "varsigma": 0x3c2, "vartheta": 0x3d1, "xi": 0x3be, "zeta": 0x3b6,
      "CC": 0x2102, "HH": 0x210d, "NN": 0x2115, "PP": 0x2119, "QQ": 0x211a, "RR": 0x211d,  "ZZ": 0x2124,
      "Im": 0x2111, "Re": 0x211c, "infty": 0x221e, "nabla": 0x2207, "wp": 0x2118,
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
const UCsymbolValues = Object.values(UCsymbols)
  .map((i) => String.fromCharCode(i))
  .join("");
const sanitizeRegEx = new RegExp("[^ -~" + UCsymbolValues + "]", "g"); // a bit too restrictive?
const sanitizeInput = function (msg: string) {
  // sanitize input
  return msg.replace(sanitizeRegEx, "").replace(/\n+$/, "");
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

    let sss = "";
    if (s.length > 0)
      for (const ss in UCsymbols) {
        if (ss.startsWith(s)) {
          sss = String.fromCharCode(UCsymbols[ss]);
          break;
        }
      }
    document.execCommand("insertText", false, sss);
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
      ((msg[i] >= "A" && msg[i] <= "Z") || (msg[i] >= "a" && msg[i] <= "z"))
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
          if (
            e.key.length == 1 &&
            ((e.key >= "a" && e.key <= "z") || (e.key >= "A" && e.key <= "Z"))
          ) {
            let lostSelection = false;
            Array.from(tabMenu.children).forEach((el) => {
              if (
                el.lastChild.textContent.length > 0 &&
                el.lastChild.textContent[0] == e.key
              ) {
                el.firstChild.textContent += e.key;
                el.lastChild.textContent = el.lastChild.textContent.substring(
                  1
                );
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

const removeDelimiterHighlight = function (el) {
  el.removeAttribute("data-highlight");
  el.removeAttribute("data-highlight-error");
};

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
  //  removeDelimiterHighlight(el);
  const pos = getCaret(el) - 1;
  const input = el.innerText;
  const highlight = input.replace(/\S/g, " "); // only newlines left
  if (pos > 0 && input[pos - 1] == "\\") return true; // \" does not trigger highlighting
  let flag = 0;
  let last = -1;
  let i;
  for (i = 0; i < pos; i++)
    if (input[i] == quote && (i == 0 || input[i - 1] != "\\")) {
      flag = 1 - flag;
      last = i;
    }
  if (flag == 0) return true;
  // it was closing "
  el.dataset.highlight =
    highlight.substring(0, last) +
    quote +
    highlight.substring(last + 1, pos) +
    quote;
  // does not try to check if opening ", too confusing
  setTimeout(function () {
    el.removeAttribute("data-highlight");
  }, 1000);
  return true;
};

const closingDelimiterHandling = function (index, el) {
  //  removeDelimiterHighlight(el);
  const pos = getCaret(el) - 1;

  const opening = openingDelimiters[index];
  const closing = closingDelimiters[index];

  const input = el.innerText;
  const highlight = input.replace(/\S/g, " "); // only newlines left
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
    el.dataset.highlight =
      highlight.substring(0, i) +
      opening +
      highlight.substring(i + 1, pos) +
      closing;
    setTimeout(function () {
      el.removeAttribute("data-highlight");
    }, 1000);
  } else el.dataset.highlightError = highlight.substring(0, pos) + closing;
  setTimeout(function () {
    el.removeAttribute("data-highlight-error");
  }, 1000);
  //  }
  return true;
};

const openingDelimiterHandling = function (index, el) {
  //  removeDelimiterHighlight(el);
  const pos = getCaret(el) - 1;
  const opening = openingDelimiters[index];
  const closing = closingDelimiters[index];
  const input = el.innerText;
  const highlight = input.replace(/\S/g, " "); // only newlines left
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
    el.dataset.highlight =
      highlight.substring(0, pos) +
      opening +
      highlight.substring(pos + 1, i) +
      closing;
    setTimeout(function () {
      el.removeAttribute("data-highlight");
    }, 1000);
  } // we never throw an error on an opening delimiter -- it's assumed more input is coming
  return true;
};

const M2indent = 4;
const spacing = { " ": 1, "\t": 8 };

const autoIndent = function (el) {
  let pos = getCaret(el) - 1;
  if (el.innerText[pos] != "\n") return; // e.g. when pressing enter in autocomplete menu
  const input = el.innerText;
  let pos1 = pos - 1;
  let level = 0;
  while (pos1 >= 0 && input[pos1] != "\n") {
    if (openingDelimiters.indexOf(input[pos1]) >= 0) level++;
    else if (closingDelimiters.indexOf(input[pos1]) >= 0) level--;
    pos1--;
  }
  let indent = input.substring(pos1 + 1, pos).match(/^[ \t]*/)[0];
  let extraIndent = level * M2indent;
  pos = indent.length;
  while (extraIndent < 0 && pos > 0) {
    extraIndent += spacing[indent[pos - 1]];
    pos--;
  }
  indent = indent.substring(0, pos);
  if (extraIndent > 0) indent += " ".repeat(extraIndent);
  document.execCommand("insertText", false, indent);
};

const syntaxHighlight = function (el: HTMLElement) {
  if (autoComplete) return; // no highlighting while autocomplete menu is on, would make a mess!!
  // sadly, never happens -- oninput sucks

  const sel = window.getSelection();
  if (sel.isCollapsed) {
    // to simplify (TEMP?) no hiliting while selecting
    const caret = getCaret(el);
    const newHTML = Prism.highlight(el.innerText, Prism.languages.macaulay2);
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
  // different: replace content
  if (fileName.endsWith(".m2"))
    el.innerHTML = Prism.highlight(txt, Prism.languages.macaulay2);
  else el.textContent = txt;
};

export {
  escapeKeyHandling,
  autoCompleteHandling,
  removeAutoComplete,
  sanitizeInput,
  delimiterHandling,
  removeDelimiterHighlight,
  syntaxHighlight,
  updateAndHighlightMaybe,
  autoIndent,
};
