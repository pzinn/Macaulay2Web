// based on katex auto-render
declare const katex;
const katexMacros = {
  "\\break": "\\\\",
  "\\ZZ": "\\mathbb{Z}",
  "\\NN": "\\mathbb{N}",
  "\\QQ": "\\mathbb{Q}",
  "\\RR": "\\mathbb{R}",
  "\\CC": "\\mathbb{C}",
  "\\PP": "\\mathbb{P}",
  "\\mac": "\\textsf{Macaulay2}", // can't use italic because KaTeX doesn't know about italic correction
};
const delimiters = [
  { left: "$$", right: "$$", display: true },
  // LaTeX uses $…$, but it ruins the display of normal `$` in text:
  { left: "$", right: "$", display: false },
  // $ must come after $$
  { left: "\\(", right: "\\)", display: false },
  { left: "\\[", right: "\\]", display: true },
];

const katexOptions = {
  macros: katexMacros,
  //  delimiters: delimiters, // not needed: auto-render bypassed
  displayMode: true,
  fleqn: true,
  trust: true,
  strict: false,
  maxExpand: Infinity,
  //  output: "html", // not needed: renderToHTMLTree called below
  ignoredTags: [
    "script",
    "noscript",
    "style",
    "textarea",
    "pre",
    "code",
    "option",
    "tt",
  ].map((x) => x.toUpperCase()),
  ignoredClasses: ["M2Text"],
  errorCallback: console.error,
};

katexOptions.ignoredTags.push("text"); // svg text

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

const escapeRegex = function (string) {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
};

const regexLeft = new RegExp(
  "(" + delimiters.map((x) => escapeRegex(x.left)).join("|") + ")"
);

const splitAtDelimiters = function (text) {
  let index;
  const data = [];

  while (true) {
    index = text.search(regexLeft);
    if (index === -1) {
      break;
    }
    if (index > 0) {
      data.push({
        type: "text",
        data: text.slice(0, index),
      });
      text = text.slice(index); // now text starts with delimiter
    }
    const i = delimiters.findIndex((delim) => text.startsWith(delim.left)); // ... so this always succeeds
    index = findEndOfMath(delimiters[i].right, text, delimiters[i].left.length);
    if (index === -1) {
      break;
    }
    data.push({
      type: "math",
      data: text.slice(delimiters[i].left.length, index),
      rawData: text.slice(0, index + delimiters[i].right.length),
      display: delimiters[i].display,
    });
    text = text.slice(index + delimiters[i].right.length);
  }

  if (text != "")
    data.push({
      type: "text",
      data: text,
    });

  return data;
};

const renderMathInText = function (text) {
  const data = splitAtDelimiters(text);
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
      let span;
      // Override any display mode defined in the settings with that
      // defined by the text itself
      katexOptions.displayMode = data[i].display;
      try {
        span = katex
          .__renderToHTMLTree("\\displaystyle " + data[i].data, katexOptions) // move displaystyle elsewhere
          .toNode();
      } catch (err) {
        if (!(err instanceof katex.ParseError)) {
          throw err;
        }
        katexOptions.errorCallback(
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

const autoRender = function (elem) {
  for (let i = 0; i < elem.childNodes.length; i++) {
    let childNode = elem.childNodes[i];
    if (childNode.nodeType === 3) {
      // Text node
      let str = childNode.textContent;
      const i0 = i;
      while (
        i < elem.childNodes.length - 1 &&
        elem.childNodes[i + 1].nodeType === 3
      ) {
        i++;
        childNode = elem.childNodes[i];
        str += childNode.textContent; // in case text nodes get split because of max length
      }
      const frag = renderMathInText(str);
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
      if (
        katexOptions.ignoredTags.indexOf(childNode.nodeName) === -1 &&
        katexOptions.ignoredClasses.every(
          (x) => !childNode.classList.contains(x)
        )
      )
        autoRender(childNode);
    }
    // Otherwise, it's something else, and ignore it.
  }
};

export { autoRender };
