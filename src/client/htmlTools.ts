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
      while (!cur.nextSibling)
        if (cur == el) return null;
        else cur = cur.parentElement;
      cur = cur.nextSibling;
    } else if (cur.nodeType === 1) cur = cur.firstChild; // forward
  }
};

const setCaretInternal = function (el, pos: number): void {
  const sel = window.getSelection();
  sel.collapse(el, pos);
};
// some of these edge cases need to be clarified (empty HTMLElements; etc)
const setCaret = function (el, pos: number): void {
  el.focus({ preventScroll: true });
  if (pos === 0) {
    setCaretInternal(el, pos);
    return;
  }
  let cur = el.firstChild;
  if (!cur) return;
  while (true) {
    if (cur.nodeType === 3) {
      if (pos <= cur.textContent.length) {
        // bingo
        setCaretInternal(cur, pos);
        return;
      }
      pos -= cur.textContent.length;
    }
    if (cur.nodeType !== 1 || (cur.nodeType === 1 && !cur.firstChild)) {
      // backtrack
      while (!cur.nextSibling)
        if (cur == el) return null;
        else cur = cur.parentElement;
      cur = cur.nextSibling;
    } else cur = cur.firstChild; // forward
  }
};

const setCaretAtEndMaybe = function (el, flag?) {
  // flag means only do it if not already in input
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
  el.innerHTML = el.textContent;
  if (caret !== null)
    // note that it could be zero
    setCaret(el, caret);
};

// this one works everywhere
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

/*
// ~ like innerText, but for document fragments: textContent + <br>, </div>, </p> -> \n
const fragInnerText = function (frag) {
  if (frag.nodeName == "BR") return "\n";
  else if (frag.nodeName == "#text") return frag.textContent;
  else {
    let s = "";
    for (let i = 0; i < frag.childNodes.length; i++)
      s = s + fragInnerText(frag.childNodes[i]);
    if (frag.nodeName == "DIV" || frag.nodeName == "P") s = s + "\n";
    return s;
  }
};
*/

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
