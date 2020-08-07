/* eslint-env browser */

"use strict;";

// bundle mdl
require("../../public/mdl/material.js");

document.addEventListener(
  "DOMContentLoaded",
  function () {
    const init = require("./mathProgram");
    init();
  },
  false
);
