// based on katex auto-render
declare const katex;
const katexMacros = {
  "\\break": "\\\\",
  //  "\\R": "\\mathbb{R}",
  //  "\\C": "\\mathbb{C}",
  "\\ZZ": "\\mathbb{Z}",
  "\\NN": "\\mathbb{N}",
  "\\QQ": "\\mathbb{Q}",
  "\\RR": "\\mathbb{R}",
  "\\CC": "\\mathbb{C}",
  "\\PP": "\\mathbb{P}",
};
const katexDelimiters = [
  { left: "$$", right: "$$", display: true },
  { left: "\\(", right: "\\)", display: false },
  // LaTeX uses $…$, but it ruins the display of normal `$` in text:
  { left: "$", right: "$", display: false },
  //  \[…\] must come last in this array. Otherwise, renderMathInElement
  //  will search for \[ before it searches for $$ or  \(
  // That makes it susceptible to finding a \\[0.3em] row delimiter and
  // treating it as if it were the start of a KaTeX math zone.
  { left: "\\[", right: "\\]", display: true },
];

const katexOptions = {
  macros: katexMacros,
  delimiters: katexDelimiters,
  displayMode: true,
  trust: true,
  strict: false,
  maxExpand: Infinity,
  output: "html",
  ignoredTags: [
    "script",
    "noscript",
    "style",
    "textarea",
    "pre",
    "code",
    "option",
  ].map((x) => x.toUpperCase()),
  ignoredClasses: ["M2Text"],
  errorCallback: console.error,
};

const findEndOfMath = function (delimiter, text, startIndex) {
  // Adapted from
  // https://github.com/Khan/perseus/blob/master/src/perseus-markdown.jsx
  let index = startIndex;
  let braceLevel = 0;

  const delimLength = delimiter.length;

  while (index < text.length) {
    const character = text[index];

    if (
      braceLevel <= 0 &&
      text.slice(index, index + delimLength) === delimiter
    ) {
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

const splitAtDelimiters = function (startData, leftDelim, rightDelim, display) {
  const finalData = [];

  for (let i = 0; i < startData.length; i++) {
    if (startData[i].type === "text") {
      const text = startData[i].data;

      let lookingForLeft = true;
      let currIndex = 0;
      let nextIndex;

      nextIndex = text.indexOf(leftDelim);
      if (nextIndex !== -1) {
        currIndex = nextIndex;
        if (currIndex > 0)
          finalData.push({
            type: "text",
            data: text.slice(0, currIndex),
          });
        lookingForLeft = false;
      }

      while (true) {
        if (lookingForLeft) {
          nextIndex = text.indexOf(leftDelim, currIndex);
          if (nextIndex === -1) {
            break;
          }
          if (currIndex < nextIndex)
            finalData.push({
              type: "text",
              data: text.slice(currIndex, nextIndex),
            });

          currIndex = nextIndex;
        } else {
          nextIndex = findEndOfMath(
            rightDelim,
            text,
            currIndex + leftDelim.length
          );
          if (nextIndex === -1) {
            break;
          }

          finalData.push({
            type: "math",
            data: text.slice(currIndex + leftDelim.length, nextIndex),
            rawData: text.slice(currIndex, nextIndex + rightDelim.length),
            display: display,
          });

          currIndex = nextIndex + rightDelim.length;
        }

        lookingForLeft = !lookingForLeft;
      }

      if (currIndex < text.length)
        finalData.push({
          type: "text",
          data: text.slice(currIndex),
        });
    } else {
      finalData.push(startData[i]);
    }
  }

  return finalData;
};

const splitWithDelimiters = function (text, delimiters) {
  let data = [{ type: "text", data: text, display: null, rawData: null }];
  for (let i = 0; i < delimiters.length; i++) {
    const delimiter = delimiters[i];
    data = splitAtDelimiters(
      data,
      delimiter.left,
      delimiter.right,
      delimiter.display || false
    );
  }
  return data;
};

/* Note: optionsCopy is mutated by this method. If it is ever exposed in the
 * API, we should copy it before mutating.
 */
const renderMathInText = function (text, optionsCopy: any) {
  const data = splitWithDelimiters(text, optionsCopy.delimiters);
  if (data.length === 1 && data[0].type === "text") {
    // There is no formula in the text.
    // Let's return null which means there is no need to replace
    // the current text node with a new one.
    return null;
  }

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < data.length; i++) {
    if (data[i].type === "text") {
      fragment.appendChild(document.createTextNode(data[i].data));
    } else {
      let math = data[i].data;
      let span;
      // Override any display mode defined in the settings with that
      // defined by the text itself
      optionsCopy.displayMode = data[i].display;
      try {
        if (optionsCopy.preProcess) {
          math = optionsCopy.preProcess(math);
        }
        span = katex
          .__renderToHTMLTree("\\displaystyle " + math, optionsCopy) // move displaystyle elsewhere
          .toNode();
      } catch (err) {
        if (!(err instanceof katex.ParseError)) {
          throw err;
        }
        optionsCopy.errorCallback(
          "KaTeX auto-render: Failed to parse `" + data[i].data + "` with ",
          err
        );
        span = document.createElement("span");
        span.textContent = data[i].rawData;
        span.title = err;
        span.classList.add("KatexError");
      }
      fragment.appendChild(span);
    }
  }

  return fragment;
};

const renderElem = function (elem, optionsCopy: any) {
  for (let i = 0; i < elem.childNodes.length; i++) {
    let childNode = elem.childNodes[i];
    if (childNode.nodeType === 3) {
      // Text node
      let str = childNode.textContent;
      let i0 = i;
      while (
        i < elem.childNodes.length - 1 &&
        elem.childNodes[i + 1].nodeType === 3
      ) {
        i++;
        childNode = elem.childNodes[i];
        str += childNode.textContent; // in case text nodes get split because of max length
      }
      const frag = renderMathInText(str, optionsCopy);
      if (frag) {
        while (i > i0) {
          elem.removeChild(elem.childNodes[i0]);
          i--;
        }
        i += frag.childNodes.length - 1;
        elem.replaceChild(frag, childNode);
      }
    } else if (childNode.nodeType === 1) {
      // Element node
      const classList = childNode.classList;
      const shouldRender =
        optionsCopy.ignoredTags.indexOf(childNode.nodeName) === -1 &&
        optionsCopy.ignoredClasses.every((x) => !classList.contains(x));

      if (shouldRender) {
        renderElem(childNode, optionsCopy);
      }
    }
    // Otherwise, it's something else, and ignore it.
  }
};

const autoRender = function (el) {
  renderElem(el, katexOptions);
};

export { autoRender };
