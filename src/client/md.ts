// md to html conversion
const escapeHTML = (str) =>
  str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      }[tag])
  );
const mdReplace = function (str: string) {
  const pieces = escapeHTML(str).split("\t"); // \t to prevent any markdown changes
  for (let i = 0; i < pieces.length; i += 2)
    pieces[i] = pieces[i]
      /*      .replace(/!\[([^\]]*)]\(([^(]+)\)/g, '<img alt="$1" src="$2">') */
      .replace(/\[([^\]]+)]\(([^(]+?)\)/g, "<a href='$2'>$1</a>")
      // [a link](https://github.com)
      .replace(/`([^`]*)`/g, "<code>$1</code>") // `R=QQ[x]`
      .replace(
        /(?<!\S)\*\*(?=\S)([^\r]*?\S)(?<!\\)\*\*/g,
        "<strong>$1</strong>"
      ) // **really important**
      .replace(
        /\b__(?=\S)([^\r]*?\S)(?<!\\)__/g, // we can use \b because _ is considered part of the word
        "<u><strong>$1</strong></u>"
      ) // __really important__
      .replace(/(?<!\S)\*(?!\s|\*)([^\r]*?\S)(?<!\\)\*/g, "<em>$1</em>") // *important*
      .replace(/\b_(?!\s|_)([^\r]*?\S)(?<!\\)_/g, "<u>$1</u>") // _underlined_
      .replace(/\\n/g, "<br/>"); // "\n" for nonsplitting newline
  return pieces.join("\t");
};

const cut = (s, x) => mdReplace(s.substring(x[0].length));
const patterns = [
  { pattern: /^\*\s/, tag: "ul", linetag: () => "li", proc: cut },
  { pattern: /^\d+\.\s/, tag: "ol", linetag: () => "li", proc: cut },
  {
    pattern: /^#+\s/,
    tag: null,
    linetag: (x) => "h" + (x[0].length - 1),
    proc: cut,
  },
  {
    pattern: /^\|/,
    tag: "table",
    linetag: () => "tr",
    proc: (s) => {
      if (s.startsWith("|")) s = s.substring(1); // always true
      if (s.endsWith("|")) s = s.substring(0, s.length - 1);
      return "<td>" + mdReplace(s).replace(/\|/g, "</td><td>") + "</td>";
    },
  },
  {
    pattern: /^```/,
    tag: "code class='block'",
    linetag: null,
    proc: (s, x) => (x === null ? escapeHTML(s) + "\n" : ""),
  },
];

const mdToHTML = function (src, sep, doublesep) {
  // e.g. sep = null or "br", doublesep = null or "p"
  const lines = src.split(/\n|\u21B5/);
  let res = "";
  let x;
  let i,
    oldi = -1;
  let s;
  let doublesepopen = false;
  for (let n = 0; n < lines.length; n++) {
    s = lines[n].replace(/^ +| +$/g, "");
    i = patterns.findIndex((p) => {
      x = s.match(p.pattern);
      return x !== null;
    });
    if (oldi >= 0 && patterns[oldi].tag == "code class='block'") {
      // special
      if (i == oldi) {
        i = -1;
        s = "";
      } else {
        i = oldi;
        x = null;
      }
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
    } else if (s != "" || !doublesep) {
      if (doublesep && !doublesepopen) {
        res += "<" + doublesep + ">";
        doublesepopen = true;
      }
      res +=
        mdReplace(s) + (sep && n < lines.length - 1 ? "<" + sep + ">" : "\n");
    } else if (doublesepopen) {
      res += "</" + doublesep + ">";
      doublesepopen = false;
    }
  }
  if (i >= 0 && patterns[i].tag !== null) res += "</" + patterns[i].tag + ">";
  if (doublesepopen) res += "</" + doublesep + ">";
  return res;
};

export { mdToHTML };
