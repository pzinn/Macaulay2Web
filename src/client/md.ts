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

const cut = (s, x) => mdReplace(s.substring(x.index + x[0].length));
// (?<![^\s>]+\s*) means: should be at start of line except possible spaces and ~ html tags

// simple substitutions
// prettier-ignore
const mdSubst = [ // ["!\\[([^\\]]*)]\\(([^(]+)\\)",'<img alt="$1" src="$2">'],
    { pattern: "\\[([^\\]]+)]\\(([^(]+?)\\)", subst: "<a href='$2'>$1</a>"}, // [a link](https://github.com)
    { pattern: "`([^`]*)`", subst: "<code class='inline'>$1</code>"}, // `R=QQ[x]`
    { pattern: "(?<!\\S)\\*\\*(?=\\S)([^\\r]*?\\S)(?<!\\\\)\\*\\*", subst: "<strong>$1</strong>"}, // **really important**
    { pattern: "\\b__(?=\\S)([^\\r]*?\\S)(?<!\\\\)__", // we can use \\b because _ is considered part of the word
      subst: "<u><strong>$1</strong></u>"}, // __really important__
    { pattern: "(?<!\\S)\\*(?!\\s|\\*)([^\\r]*?\\S)(?<!\\\\)\\*", subst: "<em>$1</em>"}, // *important*
    { pattern: "\\b_(?!\\s|_)([^\\r]*?\\S)(?<!\\\\)_", subst: "<u>$1</u>"}, // _underlined_
    { pattern: "\\\\n", subst: "<br/>"}] as any; // "\n" for nonsplitting newline

// more complex patterns
const patterns = [
  {
    pattern: "(?<![^\\s>]+\\s*)\\*\\s",
    tag: "ul",
    linetag: () => "li",
    proc: cut,
  },
  {
    pattern: "(?<![^\\s>]+\\s*)\\d+\\.\\s",
    tag: "ol",
    linetag: () => "li",
    proc: cut,
  },
  {
    pattern: "(?<![^\\s>]+\\s*)#+\\s",
    tag: null,
    linetag: (x) => "h" + (x[0].length - 1),
    proc: cut,
  },
  {
    pattern: "(?<![^\\s>]+\\s*)\\|",
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
    pattern: "(?<![^\\s>]+\\s*)```sh",
    tag: "pre",
    linetag: null,
    proc: (s, x) => (x === null ? s + "\n" : ""),
  },
  {
    pattern: "(?<![^\\s>]+\\s*)```", // really, this should be ```m2 and previous one should be ```
    tag: "code",
    linetag: null,
    proc: (s, x) => (x === null ? s + "\n" : ""),
  },
] as any;

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
  "object",
];
let forbiddenTagsRegex;
let removeForbiddenTags;
try {
  for (let j = 0; j < mdSubst.length; j++)
    mdSubst[j].pattern = new RegExp(mdSubst[j].pattern, "g");
  for (let j = 0; j < patterns.length; j++)
    patterns[j].pattern = new RegExp(patterns[j].pattern);
  forbiddenTagsRegex = new RegExp(
    forbiddenTags.map((tag) => "(?<=<|</)" + tag).join("|") +
      "|(?<=<[^>]*\\s)id=|(?<=<[^>]*\\s)for=|(?<=<[^>]*)mdl-",
    "g"
  );
  removeForbiddenTags = (str) => str.replace(forbiddenTagsRegex, "no$&");
} catch (err) {
  console.log("regex failure"); // e.g. with safari
  mdSubst.length = 0;
  patterns.length = 0;
  forbiddenTagsRegex = new RegExp(
    forbiddenTags.map((tag) => "<" + tag).join("|"),
    "g"
  );
  removeForbiddenTags = (str) => str.replace(forbiddenTagsRegex, ""); // TEMP
}

const mdReplace = function (str: string) {
  const pieces = str.split("\t"); // \t to prevent any markdown changes
  for (let i = 0; i < pieces.length; i += 2)
    for (let j = 0; j < mdSubst.length; j++)
      pieces[i] = pieces[i].replace(mdSubst[j].pattern, mdSubst[j].subst);
  return pieces.join("\t");
};

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
