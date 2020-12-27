/* eslint-env browser */

"use strict;";

// bundle mdl
require("../../public/js/material.js");

import { init } from "./main";

document.addEventListener(
  "DOMContentLoaded",
  function () {
    init();
  },
  false
);
