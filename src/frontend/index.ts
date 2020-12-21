/* eslint-env browser */

"use strict;";

// bundle mdl
require("../../public/mdl/material.js");

import { init } from "./main";

document.addEventListener(
  "DOMContentLoaded",
  function () {
    init();
  },
  false
);
