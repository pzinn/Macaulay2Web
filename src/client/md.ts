// md to html conversion
const escapeHTML = (
  str // minimal escaping. see html-entities encode for a better solution server-side
) =>
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
const forbiddenTags = [
  "script",
  "base",
  "bdo",
  "body",
  "dialog",
  "embed",
  "form",
  "frame",
  "html",
  "iframe",
  "nav",
  "object",
];
const forbiddenTagsRegex = new RegExp(
  forbiddenTags.map((tag) => "(?<=<|</)" + tag).join("|") +
    "|(?<=<[^>]*\\s)id=|(?<=<[^>]*\\s)for=|(?<=<[^>]*)mdl-",
  "g"
);
const removeForbiddenTags = (str) => str.replace(forbiddenTagsRegex, "no$&");

const mdReplace = function (str: string) {
  const pieces = str.split("\t"); // \t to prevent any markdown changes
  for (let i = 0; i < pieces.length; i += 2)
    pieces[i] = pieces[i]
      /*      .replace(/!\[([^\]]*)]\(([^(]+)\)/g, '<img alt="$1" src="$2">') */
      .replace(/\[([^\]]+)]\(([^(]+?)\)/g, "<a href='$2'>$1</a>")
      // [a link](https://github.com)
      .replace(/`([^`]*)`/g, "<code class='inline'>$1</code>") // `R=QQ[x]`
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

const cut = (s, x) => mdReplace(s.substring(x.index + x[0].length));
// (?<![^\s>]+\s*) means: should be at start of line except possible spaces and ~ html tags
const patterns = [
  { pattern: /(?<![^\s>]+\s*)\*\s/, tag: "ul", linetag: () => "li", proc: cut },
  {
    pattern: /(?<![^\s>]+\s*)\d+\.\s/,
    tag: "ol",
    linetag: () => "li",
    proc: cut,
  },
  {
    pattern: /(?<![^\s>]+\s*)#+\s/,
    tag: null,
    linetag: (x) => "h" + (x[0].length - 1),
    proc: cut,
  },
  {
    pattern: /(?<![^\s>]+\s*)\|/,
    tag: "table",
    linetag: () => "tr",
    proc: (s, x) => {
      s = cut(s, x);
      const m = s.match(/\|\s*$/);
      if (m) s = s.substring(0, m.index);
      return "<td>" + mdReplace(s).replace(/\|/g, "</td><td>") + "</td>";
    },
  },
  {
    pattern: /(?<![^\s>]+\s*)```sh/,
    tag: "pre",
    linetag: null,
    proc: (s, x) => (x === null ? s + "\n" : ""),
  },
  {
    pattern: /(?<![^\s>]+\s*)```/, // really, this should be ```m2 and previous one should be ```
    tag: "code",
    linetag: null,
    proc: (s, x) => (x === null ? s + "\n" : ""),
  },
];

const mdToHTML = function (src, sep, doublesep) {
  // e.g. sep = null or "br", doublesep = null or "p"
  const lines = removeForbiddenTags(src)
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/<div[^>]*>/g, "")
    .split(/\n|<br[^>]*>|<\/div>/);
  let res = "";
  let x;
  let i,
    oldi = -1;
  let doublesepopen = false;
  lines.forEach(function (s, n) {
    i = patterns.findIndex((p) => {
      x = s.match(p.pattern);
      return x !== null;
    });
    if (oldi >= 0 && patterns[oldi].linetag === null) {
      // special
      if (i >= 0 && patterns[i].linetag === null) {
        i = -1;
        s = null;
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
    } else if (s != null && (s != "" || !doublesep)) {
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
  });
  if (i >= 0 && patterns[i].tag !== null) res += "</" + patterns[i].tag + ">";
  if (doublesepopen) res += "</" + doublesep + ">";
  return res;
};

export { mdToHTML, escapeHTML };
