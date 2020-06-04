const scrollDownLeft = function (el) {
  el.scrollLeft = 0;
  el.scrollTop = el.scrollHeight;
};

const scrollDown = function (el) {
  el.scrollTop = el.scrollHeight;
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

// the next 4 functions require el to have a single text node!
const placeCaret = function (el, pos) {
  el.focus({ preventScroll: true });
  if (el.childNodes.length > 1) sanitizeElement(el);
  if (el.childNodes.length == 1) {
    const sel = window.getSelection();
    sel.collapse(el.lastChild, pos);
  }
};
const addToElement = function (el, pos, s) {
  // insert into a pure text element and move care to end of insertion
  const msg = el.textContent;
  el.textContent = msg.substring(0, pos) + s + msg.substring(pos, msg.length);
  // put the caret where it should be
  //  el.focus();
  placeCaret(el, pos + s.length);
};
const placeCaretAtEnd = function (el, flag?) {
  // flag means only do it if not already in input
  if (!flag || document.activeElement != el) {
    placeCaret(el, el.textContent.length);
    el.scrollIntoView({ inline: "end", block: "end" });
  }
};
const attachElement = function (el, container) {
  // move an HTML element (with single text node) while preserving focus/caret
  const flag = document.activeElement == el;
  const offset = flag ? window.getSelection().focusOffset : 0;
  container.appendChild(el);
  if (flag) {
    //    el.focus();
    placeCaret(el, offset);
  }
};

// ... and this one forces the element to have one text node
// we're assuming isCollapsed is true to simplify
const sanitizeElement = function (el) {
  const sel = window.getSelection();
  let offset = -1;
  let content = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    let subel = el.childNodes[i];
    if (subel instanceof HTMLElement) {
      sanitizeElement(subel);
      subel = subel.firstChild;
    }
    if (sel.focusNode == subel) {
      offset = content.length + sel.focusOffset;
    }
    content += el.childNodes[i].textContent;
  }
  el.textContent = content;
  if (offset >= 0) placeCaret(el, offset);
};

// this one works everywhere
const caretIsAtEnd = function () {
  const sel = window.getSelection() as any;
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
  baselinePosition,
  placeCaret,
  addToElement,
  placeCaretAtEnd,
  attachElement,
  sanitizeElement,
  caretIsAtEnd,
};
