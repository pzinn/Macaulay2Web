/* eslint-env browser */

"use strict;";

const mathProgramName = "Macaulay2";

document.addEventListener(
  "DOMContentLoaded",
  function () {
    const init = require("./mathProgram");
    init();
  },
  false
);
