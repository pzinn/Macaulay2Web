// cell bar handling
import { setupMenu } from "./menu";
import { setCaret } from "./htmlTools";
import { myshell } from "./main";

const unselectCells = function (doc: Document) {
  const lst = Array.from(doc.getElementsByClassName("M2CellSelected"));
  lst.forEach((el) => {
    el.classList.remove("M2CellSelected");
  });
};

let contextMenu = null; // make that local

const hideContextMenu = function () {
  if (contextMenu) {
    contextMenu.onblur = null;
    contextMenu.remove();
    contextMenu = null;
  }
};

const cutList = [];
let group;
let target;

// the various actions
const runEl = (el) => {
  if (el.classList.contains("M2Cell")) Array.from(el.children).forEach(runEl);
  else if (el.classList.contains("M2PastInput")) {
    myshell.postMessage(el.textContent);
    el.classList.add("codetrigger");
    setTimeout(() => {
      el.classList.remove("codetrigger");
    }, 200);
  }
};
const removeEl = (el) => {
  if (el == target) target = target.nextElementSibling as HTMLElement;
  el.remove();
};
const wrapEl = (el) => el.classList.toggle("M2Wrapped");
const groupEl = (el) => group.appendChild(el);
const closeEl = (el) => el.classList.toggle("M2CellClosed");
const copyEl = (el) => cutList.push(el);
const cutEl = (el) => {
  copyEl(el);
  removeEl(el);
};

let inputText = "";
const inputEl = (el) => {
  if (el.classList.contains("M2Cell")) Array.from(el.children).forEach(inputEl);
  else if (el.classList.contains("M2PastInput")) inputText += el.textContent;
};

const initCopy = () => {
  cutList.length = 0;
};
const initInput = () => {
  inputText = "";
};
const initGroup = (list) => {
  const doc = target.ownerDocument;
  if (list.length > 1) {
    group = doc.createElement("div");
    group.classList.add("M2Cell");
    // insert bar at left
    const s = document.createElement("span");
    s.className = "M2CellBar M2Left";
    s.tabIndex = 0;
    group.appendChild(s);
    target.before(group);
  } else if (list.length == 1) {
    let flag = true;
    Array.from(list[0].children).forEach((el2: HTMLElement) => {
      if (el2.classList.contains("M2Cell")) target.before(el2);
      else flag = false;
    });
    if (flag) list[0].remove();
    return true;
  }
};

const finalRun = (curInput) => {
  if (curInput) setCaret(curInput, 0);
};
const finalPaste = () => {
  cutList.forEach((el) => {
    const el2 = el.cloneNode(true);
    el2.classList.remove("M2CellSelected");
    target.before(el2);
  });
};
const finalInput = () => {
  navigator.clipboard.writeText(inputText);
};

// key: [displayed key,action,init action,final action]
const barActions = {
  delete: ["Del", "Delete", removeEl, null, null],
  backspace: ["", "", removeEl], // not mentioned in menu
  enter: ["&nbsp;&#9166;&nbsp;", "Run", runEl, null, finalRun],
  w: ["&nbsp;W&nbsp;", "Wrap", wrapEl, null, null],
  " ": ["Spc", "Shrink", closeEl, null, null],
  g: ["&nbsp;G&nbsp;", "Group", groupEl, initGroup, null],
  "ctrl-x": ["Ctrl-X", "Cut", cutEl, initCopy, null],
  "ctrl-c": ["Ctrl-C", "Copy", copyEl, initCopy, null],
  "ctrl-v": ["Ctrl-V", "Paste", removeEl, null, finalPaste], // delete then paste
  i: ["&nbsp;I&nbsp;", "Input", inputEl, initInput, finalInput], // copy input to clipboard
};

const barAction = function (action: string, target0: HTMLElement) {
  const acts = barActions[action];
  if (!acts) return false;

  target = target0;
  const doc = target.ownerDocument;
  const curInput = doc.getElementsByClassName("M2CurrentInput")[0]; // OK if undefined

  const list: HTMLElement[] = Array.from(
    doc.getElementsByClassName("M2CellSelected")
  );
  const init = acts[3];
  if (init) if (init(list)) return true;

  const fn = acts[2];
  list.forEach((x) => {
    if (!x.contains(curInput) || fn == inputEl || fn == runEl) fn(x);
  });

  const final = acts[4];
  if (final) final(curInput);
  return true;
};

const barKey = function (e, target) {
  // target should be current cell (not bar)
  let key = e.key.toLowerCase();
  if (e.ctrlKey)
    if (key == "control") return;
    else key = "ctrl-" + key;
  hideContextMenu();
  e.stopPropagation();
  if (barAction(key, target)) e.preventDefault();
};

const barMouseDown = function (e) {
  const left = e.target.classList.contains("M2Left");
  const t = e.target.parentElement; // clicked cell
  const doc = e.currentTarget.ownerDocument;
  if (e.shiftKey && doc.activeElement.classList.contains("M2CellBar")) {
    const t2 = doc.activeElement.parentElement; // old selected cell
    let anc = t; // ancestor element
    while (anc && !anc.contains(t2)) anc = anc.parentElement;
    if (anc && anc != t && anc != t2) {
      const left2 = doc.activeElement.classList.contains("M2Left");
      let el = anc.firstElementChild;
      let flag = 0;
      while (flag < 2) {
        if (el.classList.contains("M2Cell")) {
          if (el == t || el == t2) flag++;
          if (
            (flag == 1 && !el.contains(t) && !el.contains(t2)) ||
            (el == t && (left || flag == 1)) ||
            (el == t2 && (left2 || flag == 1))
          )
            el.classList.add("M2CellSelected");
        }
        if (!el.classList.contains("M2CellSelected") && el.firstElementChild)
          el = el.firstElementChild;
        else {
          while (!el.nextElementSibling && el != anc) el = el.parentElement;
          if (el == anc) break;
          el = el.nextElementSibling;
        }
      }
    }
  } else {
    if (!e.ctrlKey) unselectCells(doc);
    if (left) t.classList.toggle("M2CellSelected");
  }
  e.preventDefault();
  e.target.focus();
};

const barRightClick = function (e) {
  const doc = e.currentTarget.ownerDocument; // in case of iframe

  contextMenu = doc.createElement("ul");
  contextMenu.id = "contextmenu";
  contextMenu.classList.add("menu");
  contextMenu.tabIndex = 0;
  let li, tt;
  for (const key in barActions)
    if (barActions[key][0] != "") {
      li = doc.createElement("li");
      li.dataset.key = key;
      tt = doc.createElement("tt");
      tt.style.textDecoration = "underline";
      tt.innerHTML = barActions[key][0];
      li.appendChild(tt);
      li.appendChild(doc.createTextNode(" " + barActions[key][1]));
      contextMenu.appendChild(li);
    }

  contextMenu.style.left = e.pageX + "px";
  contextMenu.style.top = e.pageY + "px";
  doc.body.appendChild(contextMenu);

  if (doc.getElementsByClassName("M2CellSelected").length == 0)
    e.target.parentElement.classList.add("M2CellSelected"); // if nothing selected, select current
  setupMenu(
    contextMenu,
    (sel) => {
      if (sel) barAction(sel.dataset.key, e.target.parentElement);
      hideContextMenu();
    },
    (ee) => {
      barKey(ee, e.target.parentElement);
    }
  );
  e.preventDefault();
};

export { barKey, hideContextMenu, barMouseDown, barRightClick, unselectCells };
