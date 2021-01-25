import { Shell } from "../client/shellEmulator";
import { webAppTags } from "../common/tags";

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

window.renderhelp = function (text) {
  text = b64DecodeUnicode(text);
  let b1 = text.indexOf("<body");
  const b2 = text.lastIndexOf("</body>");
  if (b1 < 0 || b2 < 0) return;
  let msg = text.substring(b1, b2); // not quite yet
  b1 = msg.indexOf(">");
  msg = msg.substring(b1 + 1);
  const myshell = new Shell(
    document.body,
    null,
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
  document.getElementById("katexscript").remove();
  document.getElementById("renderscript").remove();
  document.querySelector("base").remove();
};
