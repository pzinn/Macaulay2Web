/* global MathJax */
/* eslint "new-cap": "off" */
MathJax.Hub.Config({
  tex2jax: {inlineMath: [['$', '$'], ['\\(', '\\)']]}
});
MathJax.Hub.Config({
  TeX: {noErrors: {disabled: true}}
});
MathJax.Hub.Config({
  TeX: {
    Macros: {
      PP: "{\\mathbb{P}}",
      ZZ: "{\\mathbb{Z}}",
      QQ: "{\\mathbb{Q}}",
      RR: "{\\mathbb{R}}",
      CC: "{\\mathbb{C}}",
      mac: "{{\\it Macaulay2}}",
      bold: ["{\\bf #1}", 1]
    },
    MAXBUFFER: 20 * 1024
  }
});
MathJax.Hub.Config({
  "CommonHTML": {linebreaks: {automatic: true}},
  "HTML-CSS": {linebreaks: {automatic: true}},
  "SVG": {linebreaks: {automatic: true}}
});
MathJax.Hub.Register.StartupHook("mml Jax Ready", function() {
  MathJax.ElementJax.mml.math.prototype.defaults.lineleading = "0px";
});

