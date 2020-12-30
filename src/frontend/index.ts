/* eslint-env browser */

"use strict";

declare const MINIMAL;

// bundle mdl
if (MINIMAL) {
  console.log("Minimal Macaulay2Web interface");
} else {
  console.log("Full Macaulay2Web interface");
  require("js/material.js");
}

import { init } from "./main";

document.addEventListener(
  "DOMContentLoaded",
  function () {
    init();
  },
  false
);
