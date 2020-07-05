import katex from '../katex.mjs';

/* eslint no-constant-condition:0 */
var findEndOfMath = function findEndOfMath(delimiter, text, startIndex) {
  // Adapted from
  // https://github.com/Khan/perseus/blob/master/src/perseus-markdown.jsx
  var index = startIndex;
  var braceLevel = 0;
  var delimLength = delimiter.length;

  while (index < text.length) {
    var character = text[index];

    if (braceLevel <= 0 && text.slice(index, index + delimLength) === delimiter) {
      return index;
    } else if (character === "\\") {
      index++;
    } else if (character === "{") {
      braceLevel++;
    } else if (character === "}") {
      braceLevel--;
    }

    index++;
  }

  return -1;
};

var splitAtDelimiters = function splitAtDelimiters(startData, leftDelim, rightDelim, display) {
  var finalData = [];

  for (var i = 0; i < startData.length; i++) {
    if (startData[i].type === "text") {
      var text = startData[i].data;
      var lookingForLeft = true;
      var currIndex = 0;
      var nextIndex = void 0;
      nextIndex = text.indexOf(leftDelim);

      if (nextIndex !== -1) {
        currIndex = nextIndex;
        finalData.push({
          type: "text",
          data: text.slice(0, currIndex)
        });
        lookingForLeft = false;
      }

      while (true) {
        if (lookingForLeft) {
          nextIndex = text.indexOf(leftDelim, currIndex);

          if (nextIndex === -1) {
            break;
          }

          finalData.push({
            type: "text",
            data: text.slice(currIndex, nextIndex)
          });
          currIndex = nextIndex;
        } else {
          nextIndex = findEndOfMath(rightDelim, text, currIndex + leftDelim.length);

          if (nextIndex === -1) {
            break;
          }

          finalData.push({
            type: "math",
            data: text.slice(currIndex + leftDelim.length, nextIndex),
            rawData: text.slice(currIndex, nextIndex + rightDelim.length),
            display: display
          });
          currIndex = nextIndex + rightDelim.length;
        }

        lookingForLeft = !lookingForLeft;
      }

      finalData.push({
        type: "text",
        data: text.slice(currIndex)
      });
    } else {
      finalData.push(startData[i]);
    }
  }

  return finalData;
};

/* eslint no-console:0 */

var splitWithDelimiters = function splitWithDelimiters(text, delimiters) {
  var data = [{
    type: "text",
    data: text
  }];

  for (var i = 0; i < delimiters.length; i++) {
    var delimiter = delimiters[i];
    data = splitAtDelimiters(data, delimiter.left, delimiter.right, delimiter.display || false);
  }

  return data;
};
/* Note: optionsCopy is mutated by this method. If it is ever exposed in the
 * API, we should copy it before mutating.
 */


var renderMathInText = function renderMathInText(text, optionsCopy) {
  var data = splitWithDelimiters(text, optionsCopy.delimiters);

  if (data.length === 1 && data[0].type === 'text') {
    // There is no formula in the text.
    // Let's return null which means there is no need to replace
    // the current text node with a new one.
    return null;
  }

  var fragment = document.createDocumentFragment();

  for (var i = 0; i < data.length; i++) {
    if (data[i].type === "text") {
      fragment.appendChild(document.createTextNode(data[i].data));
    } else {
      var span = document.createElement("span");
      var math = data[i].data; // Override any display mode defined in the settings with that
      // defined by the text itself

      optionsCopy.displayMode = data[i].display;

      try {
        if (optionsCopy.preProcess) {
          math = optionsCopy.preProcess(math);
        }

        katex.render(math, span, optionsCopy);
      } catch (e) {
        if (!(e instanceof katex.ParseError)) {
          throw e;
        }

        optionsCopy.errorCallback("KaTeX auto-render: Failed to parse `" + data[i].data + "` with ", e);
        fragment.appendChild(document.createTextNode(data[i].rawData));
        continue;
      }

      fragment.appendChild(span);
    }
  }

  return fragment;
};

var renderElem = function renderElem(elem, optionsCopy) {
  for (var i = 0; i < elem.childNodes.length; i++) {
    var childNode = elem.childNodes[i];

    if (childNode.nodeType === 3) {
      // Text node
      var frag = renderMathInText(childNode.textContent, optionsCopy);

      if (frag) {
        i += frag.childNodes.length - 1;
        elem.replaceChild(frag, childNode);
      }
    } else if (childNode.nodeType === 1) {
      (function () {
        // Element node
        var className = ' ' + childNode.className + ' ';
        var shouldRender = optionsCopy.ignoredTags.indexOf(childNode.nodeName.toLowerCase()) === -1 && optionsCopy.ignoredClasses.every(x => className.indexOf(' ' + x + ' ') === -1);

        if (shouldRender) {
          renderElem(childNode, optionsCopy);
        }
      })();
    } // Otherwise, it's something else, and ignore it.

  }
};

var renderMathInElement = function renderMathInElement(elem, options) {
  if (!elem) {
    throw new Error("No element provided to render");
  }

  var optionsCopy = {}; // Object.assign(optionsCopy, option)

  for (var option in options) {
    if (options.hasOwnProperty(option)) {
      optionsCopy[option] = options[option];
    }
  } // default options


  optionsCopy.delimiters = optionsCopy.delimiters || [{
    left: "$$",
    right: "$$",
    display: true
  }, {
    left: "\\(",
    right: "\\)",
    display: false
  }, // LaTeX uses $…$, but it ruins the display of normal `$` in text:
  // {left: "$", right: "$", display: false},
  //  \[…\] must come last in this array. Otherwise, renderMathInElement
  //  will search for \[ before it searches for $$ or  \(
  // That makes it susceptible to finding a \\[0.3em] row delimiter and
  // treating it as if it were the start of a KaTeX math zone.
  {
    left: "\\[",
    right: "\\]",
    display: true
  }];
  optionsCopy.ignoredTags = optionsCopy.ignoredTags || ["script", "noscript", "style", "textarea", "pre", "code", "option"];
  optionsCopy.ignoredClasses = optionsCopy.ignoredClasses || [];
  optionsCopy.errorCallback = optionsCopy.errorCallback || console.error; // Enable sharing of global macros defined via `\gdef` between different
  // math elements within a single call to `renderMathInElement`.

  optionsCopy.macros = optionsCopy.macros || {};
  renderElem(elem, optionsCopy);
};

export default renderMathInElement;
