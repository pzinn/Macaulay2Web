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

// TODO: rewrite getCaret(2) in a similar way as setCaret
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

const locateRowColumn = function (el: HTMLElement, row: number, col: number) {
  // finds the offset of a row/col location in a text element
  const txt = el.innerText;
  const matches = [...txt.matchAll(/\n/g)]; // a bit clumsy TODO don't scan the whole text
  return matches.length < row ? null : matches[row - 1].index - col + 1; // not too subtle: TODO test length of row
};

const locateOffsetInternal = function (el, cur, pos: number) {
  while (true) {
    if (cur.nodeType === 3) {
      if (pos <= cur.textContent.length)
        // bingo
        return [cur, pos];
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
      // then go to next sibling
      cur = cur.nextSibling;
    } else cur = cur.firstChild; // otherwise forward
  }
};

const locateOffset = function (el: HTMLElement, pos: number) {
  // finds the node/node offset of a given character pos in a text element
  const cur = el.firstChild;
  return cur ? locateOffsetInternal(el, cur, pos) : pos == 0 ? [el, 0] : null; // not sure about the cur === null case
};

const locateOffset2 = function (el: HTMLElement, pos1: number, pos2: number) {
  // finds the node/node offset of two character pos in a text element
  const cur = el.firstChild;
  if (cur === null) return pos1 == 0 && pos2 == 0 ? [el, 0] : null; // not sure about the cur === null case
  const node1 = locateOffsetInternal(el, cur, pos1);
  if (node1 === null) return null;
  const node2 = locateOffsetInternal(el, node1[0], pos2 - pos1 + node1[1]);
  if (node2 === null) return null;
  return [node1[0], node1[1], node2[0], node2[1]]; // TODO use objects
};

// some of these edge cases need to be clarified (empty HTMLElements; etc)
const setCaret = function (
  el,
  pos1: number,
  pos2?: number,
  mark?: boolean
): void {
  let len;
  if (!pos2) pos2 = pos1;
  else if (pos2 < pos1) {
    const pos = pos1;
    pos1 = pos2;
    pos2 = pos;
  }
  el.focus({ preventScroll: true });
  const nodeOffsets = locateOffset2(el, pos1, pos2);
  const sel = window.getSelection();
  if (!nodeOffsets) sel.collapse(el, pos1);
  // ?
  else
    sel.setBaseAndExtent(
      nodeOffsets[0],
      nodeOffsets[1],
      nodeOffsets[2],
      nodeOffsets[3]
    );
};
// TODO redo scrolling, marking...
//          selectAndScroll(first, firstpos, cur, pos, mark);

const forwardCaret = function (el, incr: number): void {
  const sel = window.getSelection();
  const node = locateOffsetInternal(el, sel.focusNode, sel.focusOffset + incr);
  if (node !== null)
    window.getSelection().setBaseAndExtent(node[0], node[1], node[0], node[1]);
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

/*
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
*/

// TODO retire/rewrite this function (two distinct uses: for editor / for stdio error)
const selectRowColumn = function (el, m, k, scroll) {
  // element,rows/cols,starting line no
  // find location in element text and select it/scroll
  if (!m || !m[2]) {
    el.focus({ preventScroll: true });
    return true;
  }
  let row1 = +m[2];
  if (row1 < 1) row1 = 1;
  let col1 = m[3] ? +m[3] : 1;
  if (col1 < 1) col1 = 1;
  let row2 = m[5] ? +m[4] : row1;
  if (row2 < row1) row2 = row1;
  let col2 = m[5] ? +m[5] : m[4] ? +m[4] : col1;
  if (row2 == row1 && col2 < col1) col2 = col1;
  const pos1 = locateRowColumn(el, row1, col1);
  if (pos1 === null) return false;
  let pos2 = locateRowColumn(el, row2, col2);
  if (pos2 === null) pos2 = el.innerText.length;
  const nodesOffsets = locateOffset2(el, pos1, pos2);
  if (!nodesOffsets) return false; // shouldn't happen
  const sel = window.getSelection();
  sel.setBaseAndExtent(
    nodesOffsets[0],
    nodesOffsets[1],
    nodesOffsets[2],
    nodesOffsets[3]
  );

  let marker = document.getElementById("marker");
  if (marker) marker.remove(); // simpler to delete and remake
  marker = document.createElement("span");
  marker.id = "marker";
  nodesOffsets[2].parentElement.insertBefore(
    marker,
    nodesOffsets[2].splitText(nodesOffsets[3])
  ); // !!

  if (pos1 == pos2) marker.classList.add("caret-marker");
  if (scroll)
    setTimeout(function () {
      // in case not in editor tab, need to wait
      marker.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "end",
      });
    }, 0);
  setTimeout(function () {
    marker.remove();
  }, 1000);

  return true;
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
  selectRowColumn,
};
