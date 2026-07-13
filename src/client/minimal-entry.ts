/* eslint-env browser */

"use strict";

console.log("Minimal Macaulay2Web interface");

require("./js/prism-M2.js");
require("./js/VectorGraphics.js");

import { init } from "./main";

document.addEventListener("DOMContentLoaded", () => init(), false);
