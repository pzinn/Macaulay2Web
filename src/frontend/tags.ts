const mathJaxTagsArray = [17, 18, 19, 20, 28, 29, 30, 31].map((x) => String.fromCharCode(x));
const [mathJaxTextTag,        // indicates what follows is pure text; default mode
       mathJaxHtmlTag,        // indicates what follows is HTML
       mathJaxOutputTag,      // it's html but it's output
       mathJaxInputTag,       // it's text but it's input
       mathJaxInputContdTag,  // text, continuation of input
       mathJaxInputEndTag,    // only used internally
       mathJaxScriptTag,      // script
       mathJaxEndScriptTag]  // end script
      = mathJaxTagsArray;
export {mathJaxTagsArray,mathJaxTextTag, mathJaxHtmlTag, mathJaxOutputTag,  mathJaxInputTag, mathJaxInputContdTag, mathJaxScriptTag, mathJaxEndScriptTag, mathJaxInputEndTag}
