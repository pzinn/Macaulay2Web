/* eslint-env browser */

"use strict;";

document.addEventListener(
  "DOMContentLoaded",
  function () {
    const init = require("../dist/frontend/mathProgram");
    init();
  },
  false
);
