const webAppTagCodes = [
  ["Html", 17, "M2Html"], // indicates what follows is HTML
  ["End", 18, "M2End"], // end of HTML (or url) section
  ["Cell", 19, "M2Text M2Cell"], // cell (bundled input + output)
  ["CellEnd", 20, "M2CellEnd"], // end of cell
  ["InputEnd", 22, ""], // explicit end of an input section
  ["EvaluationEnd", 23, ""], // input/evaluation for the current cell is complete
  ["Input", 28, "M2Text M2Input"], // it's text but it's input
  ["InputContd", 29, "M2Text M2Input M2InputContd"], // text, continuation of input
  ["InputDiscarded", 31, ""], // remaining buffered input was discarded
  ["Prompt", 14, "M2Text M2Prompt"],
  ["Position", 21, "M2Position"],
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

const completionProtocol = {
  RequestStart: "\x1b]M2-COMPLETE-REQUEST;",
  ResponseStart: "\x1b]M2-COMPLETE-RESPONSE;",
  End: "\x07",
};

export { webAppTags, webAppClasses, webAppRegex, completionProtocol };
