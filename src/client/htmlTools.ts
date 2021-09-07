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

const selectAndScroll = function (
  node1,
  offset1: number,
  node2,
  offset2: number,
  mark: boolean
) {
  const sel = window.getSelection();

  let marker;
  if (mark) {
    marker = document.getElementById("marker");
    if (marker) marker.remove(); // simpler to delete and remake
    marker = document.createElement("span");
    marker.id = "marker";
    node2.parentElement.insertBefore(marker, node2.splitText(offset2)); // !!
  }

  sel.setBaseAndExtent(node1, offset1, node2, offset2);

  if (mark)
    setTimeout(function () {
      marker.remove();
    }, 1000);
};

const setCaretInternal = function (
  el,
  cur,
  pos: number,
  len: number,
  mark?: boolean
) {
  let first = null;
  let firstpos;
  while (true) {
    if (cur.nodeType === 3) {
      if (pos <= cur.textContent.length) {
        // bingo
        if (first) {
          selectAndScroll(first, firstpos, cur, pos, mark);
          return;
        } else if (pos + len <= cur.textContent.length) {
          selectAndScroll(cur, pos, cur, pos + len, mark);
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
  mark?: boolean
): void {
  let len;
  if (!pos2) len = 0;
  else if (pos2 < pos) {
    len = pos - pos2;
    pos = pos2;
  } else len = pos2 - pos;
  el.focus({ preventScroll: true });
  /*
  if (pos === 0 && len === 0) {
    window.getSelection().collapse(el, pos);
    return;
  }*/
  const cur = el.firstChild;
  if (!cur) {
    window.getSelection().collapse(el, pos);
    return;
  }
  setCaretInternal(el, cur, pos, len, mark);
};

const forwardCaret = function (el, incr: number): void {
  const sel = window.getSelection();
  setCaretInternal(el, sel.focusNode, incr + sel.focusOffset, 0);
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
  const node = sel.focusNode;
  sel.modify("move", "forward", "character");
  if (offset == sel.focusOffset && node == sel.focusNode) return true;
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
