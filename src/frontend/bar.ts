// cell bar handling
import { setupMenu } from "./menu";

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
const selInput = [];
let group;
let target;

// the various actions
const runEl = (el) => {
  if (el.classList.contains("M2Cell")) Array.from(el.children).forEach(runEl);
  else if (el.classList.contains("M2PastInput")) {
    selInput.push(el);
    el.classList.add("codetrigger");
  }
};
const removeEl = (el) => {
  if (el == target) target = target.nextElementSibling as HTMLElement;
  el.remove();
};
const wrapEl = (el) => el.classList.toggle("M2Wrapped");
const groupEl = (el) => group.appendChild(el);
const closeEl = (el) => el.classList.toggle("M2CellClosed");
const cutEl = (el) => {
  copyEl(el);
  removeEl(el);
};
const copyEl = (el) => cutList.push(el);

const barActions = {
  delete: ["Del", "Delete", removeEl],
  backspace: ["", "", removeEl], // not mentioned in menu
  enter: ["&nbsp;&#9166;&nbsp;", "Run", runEl],
  w: ["&nbsp;W&nbsp;", "Wrap", wrapEl],
  " ": ["Spc", "Shrink", closeEl],
  g: ["&nbsp;G&nbsp;", "Group", groupEl],
  "ctrl-x": ["Ctrl-X", "Cut", cutEl],
  "ctrl-c": ["Ctrl-C", "Copy", copyEl],
  "ctrl-v": ["Ctrl-V", "Paste", removeEl], // delete then paste
};

const barAction = function (action: string, target0: HTMLElement) {
  target = target0;
  const doc = target.ownerDocument;

  const list: HTMLElement[] = Array.from(
    doc.getElementsByClassName("M2CellSelected")
  );

  if (action == "ctrl-x" || action == "ctrl-c") cutList.length = 0;
  else if (action == "g") {
    // special
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
  }

  if (!barActions[action]) return false;
  const fn = barActions[action][2];
  list.forEach(fn);

  if (action == "ctrl-v") {
    cutList.forEach((el) => {
      const el2 = el.cloneNode(true);
      el2.classList.remove("M2CellSelected");
      target.before(el2);
    });
  }
  if (selInput.length > 0) {
    myshell.postMessage(
      selInput
        .map((el) => {
          return el.textContent;
        })
        .join(""),
      false,
      true
    );
    setTimeout(() => {
      selInput.forEach((el) => {
        el.classList.remove("codetrigger");
      });
    }, 200);
  }
  return true;
};

const barKey = function (e) {
  let key = e.key.toLowerCase();
  if (e.ctrlKey)
    if (key == "control") return;
    else key = "ctrl-" + key;
  hideContextMenu();
  e.stopPropagation();
  if (barAction(key, e.target.parentElement)) e.preventDefault();
};

const barMouseDown = function (e, left) {
  // left = true for left bar, false for separator
  //  const t = this.parentElement;
  const t = e.target.parentElement;
  const doc = e.currentTarget.ownerDocument;
  const curInput = doc.getElementsByClassName("M2CurrentInput")[0]; // OK if undefined
  if (e.shiftKey && doc.activeElement.classList.contains("M2CellBar")) {
    const tt = doc.activeElement.parentElement;
    const lst = doc.getElementsByClassName("M2Cell");
    let i = 0;
    let flag = 0;
    while (i < lst.length && flag < 2) {
      if (lst[i] == t) flag++;
      if (lst[i] == tt) flag++;
      if (
        (flag == 1 || ((lst[i] == t || lst[i] == tt) && (left || flag == 0))) &&
        !lst[i].contains(curInput) // we refuse to touch input
      )
        lst[i].classList.add("M2CellSelected");
      i++;
    }
  } else {
    if (!e.ctrlKey) unselectCells(doc);
    if (!t.contains(curInput) && left)
      // we refuse to touch input
      t.classList.toggle("M2CellSelected");
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

  if (doc.getElementsByClassName("M2CellSelected").length == 0) {
    const curInput = doc.getElementsByClassName("M2CurrentInput")[0]; // OK if undefined
    const el = e.target.parentElement;
    if (!el.contains(curInput)) el.classList.add("M2CellSelected"); // if nothing selected, select current
  }
  setupMenu(contextMenu, (sel) => {
    if (sel) barAction(sel.dataset.key, e.target.parentElement);
    hideContextMenu();
  });
  contextMenu.onblur = hideContextMenu;
  contextMenu.onkeydown = barKey;
  e.preventDefault();
};

export { barKey, hideContextMenu, barMouseDown, barRightClick, unselectCells };
