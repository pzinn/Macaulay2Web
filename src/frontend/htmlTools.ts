const scrollDownLeft = function(el) {
    el.scrollTop=el.scrollHeight;
    el.scrollLeft=0;
}

const scrollDown = function(el) {
    el.scrollTop=el.scrollHeight;
}

const baselinePosition = function(el) {
    const probe = document.createElement('span');
    probe.appendChild(document.createTextNode('X')); probe.style.fontSize = '0'; probe.style.visibility = 'hidden';
    el.parentElement.insertBefore(probe,el);
    const result = probe.getBoundingClientRect().top - el.getBoundingClientRect().top;
    probe.remove();
    return result;
}

/* caret/selection issues:
- in chrome, anchor*=base* = start, extent*=focus* = end. *node = the DOM element itself
- in firefox, anchor* = start, focus* = end.              *node = the text node inside the dom element
*/

// the next 4 functions require el to have a single text node!
const placeCaret = function (el,pos) {
    el.focus();
    if (el.childNodes.length == 1) {
	var sel=window.getSelection();
	sel.collapse(el.lastChild,pos);
    }
    else if (el.childNodes.length > 1) console.log("placeCaret: not a single node!");
}
const addToElement = function(el,pos,s) { // insert into a pure text element and move care to end of insertion
    const msg=el.textContent;
    el.textContent = msg.substring(0,pos)+s+msg.substring(pos,msg.length);
    // put the caret where it should be
    el.focus();
    placeCaret(el,pos+s.length);
}
const placeCaretAtEnd = function(el,flag?) { // flag means only do it if not already in input
    if ((!flag)||(document.activeElement!=el))
    {
	placeCaret(el,el.textContent.length);
    }
}
const attachElement = function(el,container) { // move an HTML element (with single text node) while preserving focus/caret
    const flag = document.activeElement == el;
    const offset = flag ? window.getSelection().focusOffset : 0;
    container.appendChild(el);
    if (flag) {
	el.focus();
	placeCaret(el,offset);
    }
};




module.exports = {
    scrollDownLeft,
    scrollDown,
    baselinePosition,
    placeCaret,
    addToElement,
    placeCaretAtEnd,
    attachElement
};
