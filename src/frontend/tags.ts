const webAppTagCodes = [
  ["End", 17, ""], // end of section script
  ["Html", 18, "M2Html"], // indicates what follows is HTML
  ["Output", 19, "M2Html M2Output"], // it's html but it's output
  ["Input", 20, "M2Input"], // it's text but it's input
  ["InputContd", 28, "M2Input"], // text, continuation of input
  ["Url", 29, "M2Url"], // url
  ["Text", 30, "M2Text"], // indicates what follows is pure text; default mode. not used at the moment
  ["Tex", 31, "M2Katex"], // TeX
];
const webAppTags = {} as any;
const webAppClasses = {} as any;
webAppTagCodes.forEach((x) => {
  webAppTags[x[0]] = String.fromCharCode(x[1] as number);
  webAppClasses[String.fromCharCode(x[1] as number)] = x[2];
});

export { webAppTags, webAppClasses };
