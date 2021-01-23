// md to html conversion
// note the repeated use of pattern (?<!\\) which means not escaped with \
const escapeHTML = (str) =>
  str
    .replace(
      /[&<>'"]/g,
      (tag) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        }[tag])
    )
    /*      .replace(/!\[([^\]]*)]\(([^(]+)\)/g, '<img alt="$1" src="$2">') */
    .replace(
      /(?<!\\)\[([^\]]+)(?<!\\)](?<!\\)\(([^(]+?)(?<!\\)\)/g,
      "<a href='$2' target='_blank'>$1</a>"
    )
    // [a link](https://github.com)
    .replace(/(?<!\\)`((?:[^`]|(?<=\\)`)*)(?<!\\)`/g, "<code>$1</code>") // `R=QQ[x]`
    .replace(
      /(?<!\S)\*\*(?=\S)([^\r]*?\S)(?<!\\)\*\*(?!\S)/g,
      "<strong>$1</strong>"
    ) // **really important**
    .replace(
      /\b__(?=\S)([^\r]*?\S)(?<!\\)__\b/g, // we can use \b because _ is considered part of the word
      "<u><strong>$1</strong></u>"
    ) // __really important__
    .replace(/(?<!\S)\*(?!\s|\*)([^\r]*?\S)(?<!\\)\*(?!\S)/g, "<em>$1</em>") // *important*
    .replace(/\b_(?!\s|_)([^\r]*?\S)(?<!\\)_\b/g, "<u>$1</u>") // _underlined_
    .replace(/\\n/g, "<br/>") // "\n" for nonsplitting newline
    .replace(/\\\$/g, "<span>$</span>") // "\$" for $ symbol (not KaTeX)
    .replace(/\\\\/g, "<span>&bsol;</span>") // to avoid complications...
    .replace(/\\(?![A-Za-z0-9()\[\]])/g, ""); // remove escaping except for \( \) \[ \] (for KaTeX)

const cut = (s, x) => escapeHTML(s.substring(x[0].length));
const patterns = [
  { pattern: /^\*\s/, tag: "ul", linetag: (x) => "li", proc: cut },
  { pattern: /^\d+\.\s/, tag: "ol", linetag: (x) => "li", proc: cut },
  {
    pattern: /^#+\s/,
    tag: null,
    linetag: (x) => "h" + (x[0].length - 1),
    proc: cut,
  },
  {
    pattern: /\|/,
    tag: "table",
    linetag: (x) => "tr",
    proc: (s, x) => {
      if (s.startsWith("|")) s = s.substring(1);
      if (s.endsWith("|")) s = s.substring(0, s.length - 1);
      return (
        "<td>" +
        escapeHTML(s.replace(/\\\|/g, "&vert;")).replace(/\|/g, "</td><td>") +
        "</td>"
      );
    }, // bit of a mess
  },
  {
    pattern: /```/,
    tag: "code class='block'",
    linetag: null,
    proc: (s, x) => (x === null ? escapeHTML(s) + "\n" : ""),
  },
];

const mdtohtml = function (src, sep, doublesep) {
  // e.g. sep = null or "br", doublesep = null or "p"
  const lines = src.split(/\n|\u21B5/);
  let res = "";
  let x;
  let i,
    oldi = -1;
  let s;
  let doublesepopen = false;
  for (let n = 0; n < lines.length; n++) {
    s = lines[n].trim();
    i = patterns.findIndex((p) => {
      x = s.match(p.pattern);
      return x !== null;
    });
    if (oldi >= 0 && patterns[oldi].tag == "code class='block'") {
      // special
      if (i == oldi) {
        i = -1;
        s = "";
      } else i = oldi;
    }
    if (i != oldi) {
      if (oldi >= 0 && patterns[oldi].tag !== null)
        res += "</" + patterns[oldi].tag + ">";
      if (i >= 0 && patterns[i].tag !== null)
        res += "<" + patterns[i].tag + ">";
    }
    oldi = i;
    if (i >= 0) {
      res +=
        patterns[i].linetag !== null
          ? "<" +
            patterns[i].linetag(x) +
            ">" +
            patterns[i].proc(s, x) +
            "</" +
            patterns[i].linetag(x) +
            ">"
          : patterns[i].proc(s, x);
    } else if (s != "" || !doublesep)
      res +=
        escapeHTML(s) + (sep && n < lines.length - 1 ? "<" + sep + ">" : "\n");
    else {
      if (doublesepopen) res += "</" + doublesep + ">";
      res += "<" + doublesep + ">";
      doublesepopen = true;
    }
  }
  if (i >= 0 && patterns[i].tag !== null) res += "</" + patterns[i].tag + ">";
  if (doublesepopen) res += "</" + doublesep + ">";
  return res;
};

export { mdtohtml };
