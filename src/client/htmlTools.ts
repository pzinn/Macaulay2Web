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
const getCaretInternal = function (el, node, offset): number | null {
  let cur = el;
  let len = 0;
  while (true) {
    if (cur === node) {
      if (cur.nodeType === 3 || offset === 0)
        // bingo
        return len + offset;
      // more complicated: target node is an element
      node = node.childNodes[offset];
      offset = 0;
    }
    if (cur.nodeType === 3)
      // Text node
      len += cur.textContent.length;
    if (cur.nodeType !== 1 || (cur.nodeType === 1 && !cur.firstChild)) {
      if (cur == el) return null;
      // backtrack
      while (!cur.nextSibling) {
        //if (cur.nodeName == "DIV" || cur.nodeName == "BR") len++; // for Firefox
        cur = cur.parentElement;
        if (cur == el) return null;
      }
      //if (cur.nodeName == "DIV" || cur.nodeName == "BR") len++; // for Firefox
      cur = cur.nextSibling;
    } else cur = cur.firstChild; // forward
  }
};
const getCaret = function (el): number | null {
  const sel = window.getSelection();
  return getCaretInternal(el, sel.focusNode, sel.focusOffset);
};
const getCaret2 = function (el) {
  const sel = window.getSelection();
  return [
    getCaretInternal(el, sel.anchorNode, sel.anchorOffset),
    getCaretInternal(el, sel.focusNode, sel.focusOffset),
  ];
};

const utf8 = new TextEncoder(); // M2 uses utf8, counts locations in bytes :/
const locateRowColumn = function (txt: string, row: number, col: number) {
  // finds the offset of a row/col location in a text element
  // TODO: treat row<1 case (fail or return 0???)
  const matches = [
    { index: -1 },
    ...txt.matchAll(/\n/g),
    { index: txt.length },
  ]; // a bit clumsy TODO don't scan the whole text
  // what to do if beyond column? for now just truncate to length
  if (row < 1 || row >= matches.length) return null;
  let offset = matches[row - 1].index + 1;
  while (col > 0 && offset < matches[row].index) {
    col = col - utf8.encode(txt.charAt(offset)).length;
    offset = offset + 1;
  }
  return offset;
};

const locateOffsetInternal = function (el: HTMLElement, cur, pos: number) {
  let tentativeNode = null;
  while (true) {
    if (cur.nodeType === 3) {
      if (pos < cur.textContent.length)
        // bingo
        return [cur, pos];
      pos -= cur.textContent.length;
      if (pos == 0)
        // annoying edge case
        tentativeNode = cur;
    }
    if (cur.nodeType !== 1 || (cur.nodeType === 1 && !cur.firstChild)) {
      // backtrack
      while (!cur.nextSibling) {
        //if (cur.nodeName == "DIV" || cur.nodeName == "BR") pos--; // for Firefox
        cur = cur.parentElement;
        if (cur == el)
          return tentativeNode === null
            ? null
            : [tentativeNode, tentativeNode.textContent.length];
      }
      //if (cur.nodeName == "DIV" || cur.nodeName == "BR") pos--; // for Firefox
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
  if (cur === null) return pos1 == 0 && pos2 == 0 ? [el, 0, el, 0] : null; // not sure about the cur === null case
  const node1 = locateOffsetInternal(el, cur, pos1);
  if (node1 === null) return null;
  const node2 = locateOffsetInternal(el, node1[0], pos2 - pos1 + node1[1]);
  if (node2 === null) return null;
  return [node1[0], node1[1], node2[0], node2[1]]; // TODO use objects
};

// some of these edge cases need to be clarified (empty HTMLElements; etc)
const setCaret = function (el, pos1: number, pos2?: number, mark?: boolean) {
  if (!pos2) pos2 = pos1;
  else if (pos2 < pos1) {
    const pos = pos1;
    pos1 = pos2;
    pos2 = pos;
  }
  el.focus({ preventScroll: true });
  const nodeOffsets = locateOffset2(el, pos1, pos2);
  const sel = window.getSelection();
  if (!nodeOffsets) {
    if (mark) return el.appendChild(addMarker());
  } else {
    sel.setBaseAndExtent(
      nodeOffsets[0],
      nodeOffsets[1],
      nodeOffsets[2],
      nodeOffsets[3]
    );
    if (mark) return addMarkerPos(nodeOffsets[2], nodeOffsets[3]);
  }
};

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
    setCaret(el, el.textContent.length);
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

const selectRowColumn = function (el, rowcols) {
  let pos1 = locateRowColumn(el.textContent, rowcols[0], rowcols[1]);
  if (pos1 === null) pos1 = el.textContent.length;
  let pos2 = locateRowColumn(el.textContent, rowcols[2], rowcols[3]);
  if (pos2 === null) pos2 = el.textContent.length;
  const nodesOffsets = locateOffset2(el, pos1, pos2);
  if (!nodesOffsets) return false; // shouldn't happen
  const sel = window.getSelection();
  sel.setBaseAndExtent(
    nodesOffsets[0],
    nodesOffsets[1],
    nodesOffsets[2],
    nodesOffsets[3]
  );

  const marker = addMarkerPos(nodesOffsets[2], nodesOffsets[3]);

  if (pos1 == pos2) marker.classList.add("caret-marker");
  setTimeout(function () {
    // in case not in editor tab, need to wait
    marker.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "end",
    });
  }, 0);

  return true;
};

const addMarker = function (perma?) {
  // perma means don't remove it after 1.5s
  // markers are used for scrolling or highlighting
  const marker = document.createElement("span");
  marker.classList.add("marker");
  if (!perma)
    setTimeout(function () {
      marker.remove();
    }, 1500);
  return marker;
};

const addMarkerPos = function (node, offset, perma?) {
  const marker = addMarker(perma);
  if (node.nodeType === 3)
    // should always be the case but there are edge cases
    node.parentElement.insertBefore(marker, node.splitText(offset));
  // !!
  else node.appendChild(marker); // fall-back behavior (?)
  return marker;
};

const addMarkerEl = function (el, pos, perma?) {
  const nodeOffset = locateOffset(el, pos);
  return nodeOffset
    ? addMarkerPos(nodeOffset[0], nodeOffset[1], perma)
    : addMarker(perma);
};

const stripId = function (el) {
  // remove "id" from *children* of el. useful for cloned elements
  Array.from(el.querySelectorAll("[id]")).forEach((x) =>
    (x as HTMLElement).removeAttribute("id")
  );
};

const language = function (e) {
  // tries to determine language of code. not great...
  for (let i = 0; i < 3; i++)
    if (e != null) {
      if (e.dataset.language) return e.dataset.language;
      e = e.parentElement;
    }
  return "Macaulay2"; // by default we assume code is M2
};

const parseLocation = function (arg: string) {
  // get rid of leading "./"
  if (arg.length > 2 && arg.startsWith("./")) arg = arg.substring(2);
  // parse newName for positioning
  // figure out filename
  const m = arg.match(
    //    /([^:]*)(?::(\d+)(?::(\d+)|)(?:-(\d+)(?::(\d+)|)|)|)/
    /^([^#]+)#\D*(\d+)(?::\D*(\d+)|)(?:-\D*(\d+)(?::\D*(\d+)|)|)/,
  ) as any; // e.g. test.m2#3:5-5:7 or test.m2#L3:C5-L5:C7
  if (!m) return [arg, null];
  const rowcols = [];
  // parse m
  rowcols[0] = +m[2];
  if (rowcols[0] < 1) rowcols[0] = 1;
  rowcols[1] = m[3] ? +m[3] : 1;
  if (rowcols[1] < 0) rowcols[1] = 0;
  rowcols[2] = m[4] ? +m[4] : rowcols[0];
  if (rowcols[2] < rowcols[0]) rowcols[2] = rowcols[0];
  rowcols[3] = m[5] ? +m[5] : m[4] ? 1 : rowcols[1];
  if (rowcols[2] == rowcols[0] && rowcols[3] < rowcols[1])
    rowcols[3] = rowcols[1];
  return [m[1], rowcols];
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
  locateOffset,
  locateRowColumn,
  selectRowColumn,
  addMarker,
  addMarkerEl,
  addMarkerPos,
  stripId,
  language,
  parseLocation,
};
