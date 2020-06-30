/* eslint-env browser */

"use strict;";

mathProgramName = "Macaulay2";

document.addEventListener(
  "DOMContentLoaded",
  function () {
    const init = require("../dist/frontend/mathProgram");
    init();
  },
  false
);
