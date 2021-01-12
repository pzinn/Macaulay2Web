const webAppTagCodes = [
  ["Html", 17, "M2Html"], // indicates what follows is HTML
  ["End", 18, ""], // end of HTML (or url) section
  ["Cell", 19, "M2Text M2Cell"], // cell (bundled input + output)
  ["CellEnd", 20, ""], // end of cell
  ["Input", 28, "M2Text M2Input"], // it's text but it's input
  ["InputContd", 29, "M2Text M2Input"], // text, continuation of input
  ["Url", 30, "M2Url"], // url
];
const webAppTags = {} as any;
const webAppClasses = {} as any;
webAppTagCodes.forEach((x) => {
  webAppTags[x[0]] = String.fromCharCode(x[1] as number);
  webAppClasses[String.fromCharCode(x[1] as number)] = x[2];
});

const webAppRegex = new RegExp(
  "([" + Object.values(webAppTags).join("") + "])"
);

export { webAppTags, webAppClasses, webAppRegex };
