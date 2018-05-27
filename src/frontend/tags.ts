const mathJaxTagsArray = [17, 18, 19, 20, 28, 29, 30].map((x) => String.fromCharCode(x));
const [mathJaxEndTag,         // end of section script
       mathJaxHtmlTag,        // indicates what follows is HTML
       mathJaxOutputTag,      // it's html but it's output
       mathJaxInputTag,       // it's text but it's input
       mathJaxInputContdTag,  // text, continuation of input
       mathJaxScriptTag,      // script
       mathJaxTextTag]        // indicates what follows is pure text; default mode. not used at the moment
      = mathJaxTagsArray;
export {mathJaxTagsArray,mathJaxTextTag, mathJaxHtmlTag, mathJaxOutputTag,  mathJaxInputTag, mathJaxInputContdTag, mathJaxScriptTag, mathJaxEndTag}
