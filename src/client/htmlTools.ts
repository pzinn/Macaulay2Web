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
        if (cur.nodeName == "DIV" || cur.nodeName == "BR") len++; // for Firefox
        cur = cur.parentElement;
        if (cur == el) return null;
      }
      if (cur.nodeName == "DIV" || cur.nodeName == "BR") len++; // for Firefox
      cur = cur.nextSibling;
    } else cur = cur.firstChild; // forward
  }
};

const getCaret2 = function (el) {
  // gives both start and end of selection -- may be in wrong order!
  const sel = window.getSelection();
  let anchorPos, focusPos;
  if (el === sel.anchorNode) anchorPos = sel.anchorOffset;
  if (el === sel.focusNode) focusPos = sel.focusOffset;
  if (anchorPos !== undefined && focusPos !== undefined)
    return [anchorPos, focusPos];
  let cur = el.firstChild;
  if (!cur) return null;
  let len = 0;
  while (true) {
    if (cur == sel.anchorNode) {
      anchorPos = len + sel.anchorOffset;
      if (focusPos !== undefined) return [anchorPos, focusPos];
    }
    if (cur == sel.focusNode) {
      focusPos = len + sel.focusOffset;
      if (anchorPos !== undefined) return [anchorPos, focusPos];
    }
    if (cur.nodeType === 3)
      // Text node
      len += cur.textContent.length;
    if (cur.nodeType !== 1 || (cur.nodeType === 1 && !cur.firstChild)) {
      // backtrack
      while (!cur.nextSibling) {
        if (cur.nodeName == "DIV" || cur.nodeName == "BR") len++; // for Firefox
        cur = cur.parentElement;
        if (cur == el) return null;
      }
      if (cur.nodeName == "DIV" || cur.nodeName == "BR") len++; // for Firefox
      cur = cur.nextSibling;
    } else cur = cur.firstChild; // forward
  }
};

const scrollToCaret = function () {
  // painful way of getting scrolling to work
  setTimeout(function () {
    // in case not in editor tab, need to wait
    document.execCommand("insertHTML", false, "<span id='scrll'></span>");
    document.getElementById("scrll").scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
    document.execCommand("undo", false, null);
  }, 0);
};

const setCaretInternal = function (
  el,
  cur,
  sel,
  pos: number,
  len: number,
  scroll?: boolean
) {
  let first = null;
  let firstpos;
  while (true) {
    if (cur.nodeType === 3) {
      if (pos <= cur.textContent.length) {
        // bingo
        if (first) {
          sel.setBaseAndExtent(first, firstpos, cur, pos);
          if (scroll) scrollToCaret();
          return;
        } else if (pos + len <= cur.textContent.length) {
          sel.setBaseAndExtent(cur, pos, cur, pos + len);
          if (scroll) scrollToCaret();
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
        if (cur.nodeName == "DIV" || cur.nodeName == "BR") pos--; // for Firefox
        cur = cur.parentElement;
        if (cur == el) return null;
      }
      if (cur.nodeName == "DIV" || cur.nodeName == "BR") pos--; // for Firefox
      cur = cur.nextSibling;
    } else cur = cur.firstChild; // forward
  }
};

// some of these edge cases need to be clarified (empty HTMLElements; etc)
const setCaret = function (
  el,
  pos: number,
  pos2?: number,
  scroll?: boolean
): void {
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
  const cur = el.firstChild;
  if (!cur) return;
  setCaretInternal(el, cur, sel, pos, len, scroll);
};

const forwardCaret = function (el, incr: number): void {
  const sel = window.getSelection();
  setCaretInternal(el, sel.focusNode, sel, incr + sel.focusOffset, 0);
};

const nextChar = function () {
  const sel = window.getSelection();
  let cur = sel.focusNode;
  let pos = sel.focusOffset;
  while (pos >= cur.textContent.length) {
    pos -= cur.textContent.length;

    while (!cur.nextSibling) {
      if (cur.nodeName == "DIV" || cur.nodeName == "BR") {
        // for Firefox
        if (pos == 0) return "\n";
        pos--;
      }
      cur = cur.parentElement;
      if (cur == null) return "";
    }
    if (cur.nodeName == "DIV" || cur.nodeName == "BR") {
      // for Firefox
      if (pos == 0) return "\n";
      pos--;
    }
    cur = cur.nextSibling;
  }
  return cur.textContent[pos];
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
  getCaret2,
  setCaret,
  setCaretAtEndMaybe,
  forwardCaret,
  nextChar,
};
