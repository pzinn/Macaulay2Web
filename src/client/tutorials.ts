import { initAccordion, appendTutorialToAccordion } from "./accordion";
import { autoRender } from "./autoRender";
import { mdToHTML, escapeHTML } from "./md";
import Prism from "prismjs";

interface Lesson {
  title: HTMLElement; // <h2> element
  html: HTMLElement;
}

interface Tutorial {
  body: HTMLElement;
  lessons: HTMLCollection;
  clickAction?: any;
}

const processTutorial = function (theHtml: string) {
  const el = document.createElement("div");
  el.innerHTML = theHtml;
  // minor improvement: because <code> use white-space: pre, we remove extra spacing
  const codes = Array.from(el.getElementsByTagName("code"));
  for (const code of codes) {
    let lines = code.innerText.split(/\r?\n/);
    while (lines.length > 0 && lines[0].trim() == "") lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() == "")
      lines.pop();
    let minIndent = 1000;
    lines.forEach((l) => {
      const indent = l.match(/^\s*/)[0].length;
      if (indent != l.length && indent < minIndent) minIndent = indent;
    });
    code.innerHTML = Prism.highlight(
      lines.map((l) => l.substring(minIndent)).join("\n"),
      Prism.languages.macaulay2
    );
  }
  autoRender(el); // convert all the LaTeX at once
  const tutorial: Tutorial = {
    body: el,
    lessons: el.getElementsByTagName("section"),
  };
  return tutorial;
};

const tutorials = {};

let lessonNr: number;
let tutorialIndex: string | null;

const updateTutorialNav = function () {
  const prevBtn = document.getElementById("prevBtn") as HTMLButtonElement;
  const nextBtn = document.getElementById("nextBtn") as HTMLButtonElement;
  if (lessonNr > 1) {
    prevBtn.disabled = false;
    prevBtn.onclick = function () {
      document.location.hash =
        "tutorial-" + tutorialIndex + "-" + (lessonNr - 1);
    };
  } else {
    prevBtn.disabled = true;
    prevBtn.onclick = null;
  }
  if (lessonNr < tutorials[tutorialIndex].lessons.length) {
    nextBtn.disabled = false;
    nextBtn.onclick = function () {
      document.location.hash =
        "tutorial-" + tutorialIndex + "-" + (lessonNr + 1);
    };
  } else {
    nextBtn.disabled = true;
    nextBtn.onclick = null;
  }
  document.getElementById("lessonNr").innerHTML =
    tutorials[tutorialIndex].lessons.length == 0
      ? ""
      : " " + lessonNr + "/" + tutorials[tutorialIndex].lessons.length;
};

const uploadTutorial = function () {
  if (this.files.length == 0) return;
  const file = this.files[0];
  console.log("tutorial " + file.name + " uploaded");
  const reader = new FileReader();
  reader.readAsText(file);
  reader.onload = function (event) {
    let txt = event.target.result as string;
    let fileName = file.name;
    if (fileName.endsWith(".md")) {
      txt = markdownToHTML(txt);
      fileName = fileName.substring(0, fileName.length - 3);
    } else if (fileName.endsWith(".m2")) {
      txt = m2ToHTML(txt);
      fileName = fileName.substring(0, fileName.length - 3);
    } else if (fileName.endsWith(".html"))
      fileName = fileName.substring(0, fileName.length - 5);
    fileName = fileName.replace(/\W/g, "");
    if (startingTutorials.indexOf(fileName) >= 0) fileName = fileName + "1"; // prevents overwriting default ones
    // upload to server
    const req = new XMLHttpRequest();
    const formData = new FormData();
    const file1 = new File([txt], fileName + ".html");
    formData.append("files[]", file1);
    formData.append("tutorial", "true");
    req.open("POST", "/upload");
    req.send(formData);

    const newTutorial = processTutorial(txt);
    //    if (!newTutorial.title) return; // if no title, cancel
    tutorials[fileName] = newTutorial;
    if (tutorialIndex == fileName) tutorialIndex = null; // force reload
    initAccordion(fileName);
    appendTutorialToAccordion(newTutorial, fileName);
  };
  tutorialUploadInput.value = "";
  return;
};

const tutorialUploadInput = document.createElement("input");
tutorialUploadInput.setAttribute("type", "file");
tutorialUploadInput.setAttribute("multiple", "false");
tutorialUploadInput.addEventListener("change", uploadTutorial, false);

const loadTutorial = function (newTutorialIndex, newLessonNr) {
  initAccordion(newTutorialIndex); // reserve a slot in the accordion, for ordering purposes
  tutorials[newTutorialIndex] = { lessonNr: newLessonNr }; // reserve a slot in the list
  const xhr = new XMLHttpRequest();
  xhr.onload = function () {
    if (xhr.status != 200) {
      console.log("tutorial " + newTutorialIndex + " failed to load");
      delete tutorials[newTutorialIndex];
      return;
    }
    console.log("tutorial " + newTutorialIndex + " loaded");
    newLessonNr = tutorials[newTutorialIndex].lessonNr; // in case it was updated
    tutorials[newTutorialIndex] = processTutorial(xhr.responseText);
    appendTutorialToAccordion(
      tutorials[newTutorialIndex],
      newTutorialIndex,
      newTutorialIndex == "load" // load tutorial is special
        ? function (e) {
            e.stopPropagation();
            tutorialUploadInput.click();
          }
        : null
    );
    if (newLessonNr) renderLesson(newTutorialIndex, newLessonNr);
  };
  xhr.open("GET", "tutorials/" + newTutorialIndex + ".html", true);
  xhr.send(null);
};

const renderLessonMaybe = function (newTutorialIndex?, newLessonNr?): void {
  if (newTutorialIndex === undefined)
    newTutorialIndex = tutorialIndex ? tutorialIndex : startingTutorials[0];
  newLessonNr =
    newLessonNr === undefined
      ? newTutorialIndex === tutorialIndex
        ? lessonNr
        : 1
      : +newLessonNr;
  if (tutorialIndex === newTutorialIndex && lessonNr === newLessonNr) return;
  if (!tutorials[newTutorialIndex]) loadTutorial(newTutorialIndex, newLessonNr);
  else if (tutorials[newTutorialIndex].lessonNr !== undefined)
    // being loaded
    tutorials[newTutorialIndex].lessonNr = newLessonNr;
  else renderLesson(newTutorialIndex, newLessonNr);
};

const renderLesson = function (newTutorialIndex, newLessonNr): void {
  const lesson = document.getElementById("lesson");
  if (newTutorialIndex != tutorialIndex) {
    tutorialIndex = newTutorialIndex;
    lesson.innerHTML = "";
    lesson.appendChild(tutorials[tutorialIndex].body);
  }
  lessonNr = newLessonNr;
  if (lessonNr > tutorials[tutorialIndex].lessons.length)
    lessonNr = tutorials[tutorialIndex].lessons.length;
  else if (lessonNr < 1) lessonNr = 1;
  for (let i = 0; i < tutorials[tutorialIndex].lessons.length; i++)
    tutorials[tutorialIndex].lessons[i].style.display =
      i + 1 == lessonNr ? "block" : "none";
  lesson.scrollTop = 0;
  // should we syntax highlight tutorials?

  updateTutorialNav();
};

const markdownToHTML = function (markdownText) {
  const txt = mdToHTML(escapeHTML(markdownText), null, "p");
  return (
    "<!DOCTYPE html>\n<html>\n<body>\n" +
    txt
      .replace(/<h1>/, "<header>")
      .replace(/<h2>/, "<section><header>")
      .replace(/<h2>/g, "</section><section><header>")
      .replace(/<\/h2>|<\/h1>/g, "</header>") +
    "</section>" +
    "\n</body>\n</html>\n"
  ); //eww
};

const m2ToHTML = function (m2Text) {
  return (
    "<div>" +
    escapeHTML(m2Text)
      .split(/\r?\n/)
      .map(function (line) {
        line = line.trim();
        if (line == "") return "<br/>";
        if (line.startsWith("--")) return line.substring(2) + "<br/>";
        return "<code>" + line + "</code>";
      })
      .join("") +
    "</div>"
  );
};

const startingTutorials = [
  "welcome",
  "basic",
  "groebner",
  "math",
  "interface",
  "load",
];
// weird hard-coding of initial tutorials TODO better

const initTutorials = function () {
  tutorialIndex = null;
  lessonNr = 1;

  for (const tute of startingTutorials) loadTutorial(tute, 0); // zero means don't render
};

const removeTutorial = function (index) {
  return function (e) {
    e.stopPropagation();
    e.currentTarget.parentElement.parentElement.remove();
    delete tutorials[index];
  };
};

export { initTutorials, renderLessonMaybe, removeTutorial, Tutorial };
