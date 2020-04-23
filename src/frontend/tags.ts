const mathJaxTagCodes = {
    "End":        17,      // end of section script
    "Html":       18,      // indicates what follows is HTML
    "Output":     19,      // it's html but it's output
    "Input":      20,      // it's text but it's input
    "InputContd": 28,      // text, continuation of input
    "Script":     29,      // script
    "Text":       30      // indicates what follows is pure text; default mode. not used at the moment
}
/*
const mathJaxTags = Object.fromEntries(Object.entries(mathJaxTagCodes).map(
    ([key,val]) => [key,String.fromCharCode(val)])); // node.js 12 accepts that
*/
// returns a new object with the values at each key mapped using mapFn(value)
function objectMap(object, mapFn) {
  return Object.keys(object).reduce(function(result, key) {
    result[key] = mapFn(object[key])
    return result
  }, {})
}
const mathJaxTags = objectMap(mathJaxTagCodes, String.fromCharCode);

module.exports = mathJaxTags;
