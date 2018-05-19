const mathJaxTagsArray = [1, 2, 3, 4, 5, 6].map((x) => String.fromCharCode(x));
const [mathJaxTextTag,        // indicates what follows is pure text; default mode
       mathJaxHtmlTag,        // indicates what follows is HTML
       mathJaxOutputTag,      // it's html but it's output
       mathJaxInputTag,       // it's text but it's input
       mathJaxInputContdTag,  // text, continuation of input
       mathJaxInputEndTag]    // only used internally
      = mathJaxTagsArray;
export {mathJaxTagsArray,mathJaxTextTag, mathJaxHtmlTag, mathJaxOutputTag,  mathJaxInputTag, mathJaxInputContdTag, mathJaxInputEndTag}
