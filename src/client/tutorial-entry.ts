/* eslint-env browser */

"use strict";

require("./js/prism-M2.js");
require("./js/VectorGraphics.js");

import { init, myshell } from "./main";
import {
  initTutorials,
  parseTutorialHash,
  renderLessonMaybe,
} from "./tutorials";

const canonicalHash = function (tutorial: string, lesson: number) {
  return "#tutorial-" + tutorial + "-" + lesson;
};

const renderTutorialRoute = function () {
  const route = parseTutorialHash(window.location.hash);
  renderLessonMaybe(route.tutorial, route.lesson);
  const canonical = canonicalHash(route.tutorial, route.lesson);
  if (window.location.hash !== canonical)
    history.replaceState(null, "", canonical);
};

const initTutorialEntry = function () {
  document.body.classList.add("tutorial-standalone");
  initTutorials({
    startingTutorials: ["welcome"],
    useAccordion: false,
    allowUpload: false,
    standalone: true,
  });
  renderTutorialRoute();
  window.addEventListener("hashchange", renderTutorialRoute);

  const interruptBtn = document.getElementById("interruptTute");
  if (interruptBtn)
    interruptBtn.onclick = function () {
      if (myshell) myshell.interrupt();
    };

  init();
};

document.addEventListener("DOMContentLoaded", initTutorialEntry, false);
