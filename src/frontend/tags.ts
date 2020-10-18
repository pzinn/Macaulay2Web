const webAppTagCodes = [
  ["End", 17, ""], // end of section script
  ["Html", 18, "M2Html"], // indicates what follows is HTML
  ["Cell", 19, "M2Text M2Cell"], // cell (bundled input + output)
  ["Input", 20, "M2Text M2Input"], // it's text but it's input
  ["InputContd", 28, "M2Text M2Input"], // text, continuation of input
  ["Url", 29, "M2Url"], // url
  ["Text", 30, "M2Text"], // indicates what follows is pure text; default mode
  ["Tex", 36, "M2Katex"], // TeX
];
const webAppTags = {} as any;
const webAppClasses = {} as any;
webAppTagCodes.forEach((x) => {
  webAppTags[x[0]] = String.fromCharCode(x[1] as number);
  webAppClasses[String.fromCharCode(x[1] as number)] = x[2];
});

webAppTags.Tex = "(?<=[^\\\\])\\$";
const webAppRegex = new RegExp("(" + Object.values(webAppTags).join("|") + ")");
webAppTags.Tex = "$";

export { webAppTags, webAppClasses, webAppRegex };
