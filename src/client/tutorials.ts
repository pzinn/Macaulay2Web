import { initAccordion, appendTutorialToAccordion } from "./accordion";
import { autoRender } from "./autoRender";
import { mdToHTML, escapeHTML } from "./md";

interface Lesson {
  title: HTMLElement; // <h2> element
  html: HTMLElement;
}

interface Tutorial {
  title?: HTMLElement; // <h1> html element
  blurb?: HTMLElement;
  clickAction?: any;
  lessons: Lesson[];
  common: HTMLElement[];
}

const sliceTutorial = function (theHtml: string) {
  const tutorial: Tutorial = { lessons: [], common: [] };
  const el = document.createElement("div");
  el.innerHTML = theHtml;
  const children = el.children;
  for (let i = 0; i < children.length; i++) {
    if (children[i].tagName == "TITLE") {
      tutorial.title = children[i] as HTMLElement;
    } else if (children[i].tagName == "TEMPLATE") {
      tutorial.blurb = children[i] as HTMLElement;
    } else if (children[i].tagName == "DIV") {
      // lessons should be top-level div
      if (children[i].childElementCount > 0) {
        const lessonTitle = children[i].firstElementChild;
        autoRender(lessonTitle);
        tutorial.lessons.push({
          title: lessonTitle as HTMLElement,
          html: children[i] as HTMLElement,
        });
      }
    } else tutorial.common.push(children[i] as HTMLElement); // rest is common stuff
  }
  if (
    !tutorial.title &&
    el.firstElementChild &&
    el.firstElementChild.tagName != "DIV"
  )
    // first child declared as title
    tutorial.title = el.firstElementChild as HTMLElement;
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
      txt = m2ToHtml(txt);
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

    const newTutorial = sliceTutorial(txt);
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
    tutorials[newTutorialIndex] = sliceTutorial(xhr.responseText);
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
  tutorialIndex = newTutorialIndex;
  lessonNr = newLessonNr;
  const lesson = document.getElementById("lesson");
  lesson.innerHTML = "";
  if (lessonNr > tutorials[tutorialIndex].lessons.length)
    lessonNr = tutorials[tutorialIndex].lessons.length;
  else if (lessonNr < 1) lessonNr = 1;
  lesson.append(...tutorials[tutorialIndex].common);
  if (tutorials[tutorialIndex].lessons.length > 0)
    lesson.appendChild(tutorials[tutorialIndex].lessons[lessonNr - 1].html);
  lesson.scrollTop = 0;
  // should we syntax highlight tutorials?

  autoRender(lesson);
  updateTutorialNav();
};

const markdownToHTML = function (markdownText) {
  const txt = mdToHTML(escapeHTML(markdownText), null, "p");
  return txt.replace("</h1>", "</h1><div>").replace(/<h2>/g, "</div><div><h2>");
};

const m2ToHtml = function (m2Text) {
  return (
    "<div>" +
    escapeHTML(m2Text)
      .split("\n")
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
