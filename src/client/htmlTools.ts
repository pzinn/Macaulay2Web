const scrollLeft = function (el) {
  el.scrollLeft = 0;
};

const scrollDown = function (el) {
  el.scrollTop = el.scrollHeight;
};

const scrollDownLeft = function (el) {
  scrollLeft(el);
  scrollDown(el);
};

const baselinePosition = function (el) {
  const probe = document.createElement("span");
  probe.appendChild(document.createTextNode("X"));
  probe.style.fontSize = "0";
  probe.style.visibility = "hidden";
  el.parentElement.insertBefore(probe, el);
  const result =
    probe.getBoundingClientRect().top - el.getBoundingClientRect().top;
  probe.remove();
  return result;
};

// caret (always assuming selection is collapsed)
const getCaret = function (el): number | null {
  const sel = window.getSelection();
  if (el === sel.focusNode) return sel.focusOffset;
  let cur = el.firstChild;
  if (!cur) return null;
  let len = 0;
  while (true) {
    if (cur == sel.focusNode)
      // bingo
      return len + sel.focusOffset;
    if (cur.nodeType === 3)
      // Text node
      len += cur.textContent.length;
    if (cur.nodeType !== 1 || (cur.nodeType === 1 && !cur.firstChild)) {
      // backtrack
      while (!cur.nextSibling) {
        if (cur == el) return null;
        if (cur.nodeName == "DIV" || cur.nodeName == "BR") len++; // for Firefox
        cur = cur.parentElement;
      }
      if (cur.nodeName == "DIV" || cur.nodeName == "BR") len++; // for Firefox
      cur = cur.nextSibling;
    } else cur = cur.firstChild; // forward
  }
};

// some of these edge cases need to be clarified (empty HTMLElements; etc)
const setCaret = function (el, pos: number, pos2?: number): void {
  let len;
  if (!pos2) len = 0;
  else if (pos2 < pos) {
    len = pos - pos2;
    pos = pos2;
  } else len = pos2 - pos;
  el.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (pos === 0 && len === 0) {
    sel.collapse(el, pos);
    return;
  }
  let cur = el.firstChild;
  let first = null;
  let firstpos;
  if (!cur) return;
  while (true) {
    if (cur.nodeType === 3) {
      if (pos <= cur.textContent.length) {
        // bingo
        if (first) {
          sel.setBaseAndExtent(first, firstpos, cur, pos);
          return;
        } else if (pos + len <= cur.textContent.length) {
          sel.setBaseAndExtent(cur, pos, cur, pos + len);
          return;
        } else {
          first = cur;
          firstpos = pos;
          pos += len;
        }
      }
      pos -= cur.textContent.length;
    }
    if (cur.nodeType !== 1 || (cur.nodeType === 1 && !cur.firstChild)) {
      // backtrack
      while (!cur.nextSibling) {
        if (cur == el) return null;
        if (cur.nodeName == "DIV" || cur.nodeName == "BR") pos--; // for Firefox
        cur = cur.parentElement;
      }
      if (cur.nodeName == "DIV" || cur.nodeName == "BR") pos--; // for Firefox
      cur = cur.nextSibling;
    } else cur = cur.firstChild; // forward
  }
};

const setCaretAtEndMaybe = function (el, flag?) {
  // flag means only do it if not already in el
  if (!flag || document.activeElement != el) {
    // not quite right... should test containance
    setCaret(el, el.innerText.length);
    el.scrollIntoView({ inline: "end", block: "nearest" });
  }
};

const attachElement = function (el, container) {
  // move an HTML element (with single text node) while preserving focus/caret
  const caret = getCaret(el);
  container.appendChild(el);
  if (caret !== null)
    // note that it could be zero
    setCaret(el, caret);
};

// not used any more
const stripElement = function (el) {
  const caret = getCaret(el);
  el.textContent = el.textContent; // !
  if (caret !== null)
    // note that it could be zero
    setCaret(el, caret);
};

// bit of a trick
const caretIsAtEnd = function () {
  const sel = window.getSelection() as any;
  if (!sel.isCollapsed) return false;
  const offset = sel.focusOffset;
  sel.modify("move", "forward", "character");
  if (offset == sel.focusOffset) return true;
  else {
    sel.modify("move", "backward", "character");
    return false;
  }
};

export {
  scrollDownLeft,
  scrollDown,
  scrollLeft,
  baselinePosition,
  attachElement,
  stripElement,
  caretIsAtEnd,
  getCaret,
  setCaret,
  setCaretAtEndMaybe,
};
