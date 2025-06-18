import { Shell } from "../client/terminal";
import { webAppTags } from "../common/tags";

require("../client/js/prism-M2.js");

const b64DecodeUnicode = function (str: string) {
  // so complicated...
  return decodeURIComponent(
    atob(str)
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );
};

function extractTag(text: string, tag: string) {
  // primitive extracter
  const i1 = text.indexOf("<" + tag);
  if (i1 < 0) return "";
  const i1b = text.indexOf(">", i1);
  if (i1b < 0) return "";
  const i2 = text.indexOf("</" + tag, i1b);
  if (i2 < 0) return "";
  return text.substring(i1b + 1, i2);
}

window.renderhelp = function (text) {
  text = b64DecodeUnicode(text);
  const msg = extractTag(text, "body");
  const title = extractTag(text, "title");
  if (title) {
    const el = document.createElement("title");
    el.textContent = title;
    document.head.appendChild(el);
  }
  const myshell = new Shell(
    document.body,
    null,
    null,
    null,
    false // no input span
  );
  document.body.classList.add("M2Html");
  document.body.dataset.code = "";
  myshell.displayOutput(msg + webAppTags.End);

  // now cleanup for prerendering
  document.body.classList.remove("M2Html");
  document.body.removeAttribute("onload");
  document.getElementById("renderscript").remove();
  document.querySelector("base").remove();
};
