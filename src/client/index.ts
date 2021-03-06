/* eslint-env browser */

"use strict";

declare const MINIMAL;

// bundle mdl
if (MINIMAL) {
  console.log("Minimal Macaulay2Web interface");
} else {
  console.log("Full Macaulay2Web interface");

  // ugly hack: prevent mdl's built-in tab handling
  const addEventListener = HTMLAnchorElement.prototype.addEventListener;
  HTMLAnchorElement.prototype.addEventListener = function (a, b, c) {
    if (!this.classList.contains("mdl-tabs__tab"))
      addEventListener.bind(this, a, b, c);
  };

  require("./js/material.js");

  // must add this due to failure of mdl, see https://stackoverflow.com/questions/31536467/how-to-hide-drawer-upon-user-click
  document.addEventListener(
    "DOMContentLoaded",
    function () {
      const drawer = document.querySelector(".mdl-layout__drawer");
      drawer.addEventListener(
        "click",
        function () {
          document
            .querySelector(".mdl-layout__obfuscator")
            .classList.remove("is-visible");
          this.classList.remove("is-visible");
        },
        false
      );
    },
    false
  );
}

require("./js/VectorGraphics.js");

import { init } from "./main";

document.addEventListener("DOMContentLoaded", init, false);
