/* eslint-env browser */

"use strict";

declare const MINIMAL;

if (MINIMAL) {
  console.log("Minimal Macaulay2Web interface");
} else {
  console.log("Full Macaulay2Web interface");

  const initDrawer = function () {
    const layout = document.querySelector(".app-shell");
    const drawer = document.querySelector(".app-drawer");
    const overlay = document.getElementById("drawerOverlay");
    const toggleBtn = document.getElementById("drawerToggle");
    if (!layout || !drawer || !overlay || !toggleBtn) return;
    const mobileQuery = window.matchMedia("(max-width: 1023px)");

    const syncScreenClass = function () {
      if (mobileQuery.matches) layout.classList.add("is-small-screen");
      else layout.classList.remove("is-small-screen");
    };

    const closeDrawer = function () {
      drawer.classList.remove("is-visible");
      overlay.classList.remove("is-visible");
      layout.classList.remove("drawer-open");
    };

    const openDrawer = function () {
      if (!mobileQuery.matches) return;
      drawer.classList.add("is-visible");
      overlay.classList.add("is-visible");
      layout.classList.add("drawer-open");
    };

    toggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (drawer.classList.contains("is-visible")) closeDrawer();
      else openDrawer();
    });

    overlay.addEventListener("click", closeDrawer);

    drawer.addEventListener("click", function (e) {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "A" || target.closest("a")))
        closeDrawer();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDrawer();
    });

    window.addEventListener("resize", closeDrawer);
    window.addEventListener("resize", syncScreenClass);
    syncScreenClass();
  };

  document.addEventListener(
    "DOMContentLoaded",
    function () {
      initDrawer();
    },
    false
  );
}

require("./js/prism-M2.js");

require("./js/VectorGraphics.js");

import { init } from "./main";

document.addEventListener("DOMContentLoaded", init, false);
