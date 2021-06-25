import { appendTutorialToAccordion } from "./accordion";
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
  if (!tutorial.title && el.firstElementChild.tagName != "DIV")
    // first child declared as title
    tutorial.title = el.firstElementChild as HTMLElement;
  return tutorial;
};

const tutorials = {};

let lessonNr: number;
let tutorialNr: string | null;

const updateTutorialNav = function () {
  const prevBtn = document.getElementById("prevBtn") as HTMLButtonElement;
  const nextBtn = document.getElementById("nextBtn") as HTMLButtonElement;
  if (lessonNr > 1) {
    prevBtn.disabled = false;
    prevBtn.onclick = function () {
      document.location.hash = "tutorial-" + tutorialNr + "-" + (lessonNr - 1);
    };
  } else {
    prevBtn.disabled = true;
    prevBtn.onclick = null;
  }
  if (lessonNr < tutorials[tutorialNr].lessons.length) {
    nextBtn.disabled = false;
    nextBtn.onclick = function () {
      document.location.hash = "tutorial-" + tutorialNr + "-" + (lessonNr + 1);
    };
  } else {
    nextBtn.disabled = true;
    nextBtn.onclick = null;
  }
  document.getElementById("lessonNr").innerHTML =
    " " + lessonNr + "/" + tutorials[tutorialNr].lessons.length;
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
      txt = markdownToHtml(txt);
      fileName = fileName.substring(0, fileName.length - 3);
    } else if (fileName.endsWith(".m2")) {
      txt = m2ToHtml(txt);
      fileName = fileName.substring(0, fileName.length - 3);
    } else if (fileName.endsWith(".html"))
      fileName = fileName.substring(0, fileName.length - 5);
    fileName = fileName.replace(/\W/g, "");
    if (fileName.length <= 1) fileName = "tu" + fileName; // kinda random. prevents overwrite default ones
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
    if (!newTutorial.title) {
      newTutorial.title = document.createElement("h1"); // if no title...
      newTutorial.title.innerHTML = fileName;
    }
    tutorials[fileName] = newTutorial;
    if (tutorialNr == fileName) tutorialNr = null; // force reload
    appendTutorialToAccordion(newTutorial, fileName);
  };
  return false;
};

const tutorialUploadInput = document.createElement("input");
tutorialUploadInput.setAttribute("type", "file");
tutorialUploadInput.setAttribute("multiple", "false");
tutorialUploadInput.addEventListener("change", uploadTutorial, false);

const loadLesson = function (newTutorialNr) {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "tutorials/" + newTutorialNr + ".html", true);
  xhr.onload = function () {
    console.log("tutorial " + newTutorialNr + " loaded");
    const render = tutorials[newTutorialNr].render;
    tutorials[newTutorialNr] = sliceTutorial(xhr.responseText);
    appendTutorialToAccordion(
      tutorials[newTutorialNr],
      newTutorialNr,
      newTutorialNr == ntutorials - 1 // lame
        ? function (e) {
            e.stopPropagation();
            tutorialUploadInput.click();
          }
        : null
    );
    if (render) renderLesson();
  };
  xhr.send(null);
};

const renderLessonMaybe = function (newTutorialNr?, newLessonNr?): void {
  if (newTutorialNr === undefined)
    newTutorialNr = tutorialNr ? tutorialNr : "0";
  newLessonNr =
    newLessonNr === undefined
      ? newTutorialNr === tutorialNr
        ? lessonNr
        : 1
      : +newLessonNr;
  if (tutorialNr === newTutorialNr && lessonNr === newLessonNr) return;
  tutorialNr = newTutorialNr;
  lessonNr = newLessonNr;
  if (!tutorials[tutorialNr]) {
    tutorials[tutorialNr] = { render: true };
    loadLesson(tutorialNr);
  } else if (!tutorials[tutorialNr].lessons)
    tutorials[tutorialNr].render = true;
  // being loaded
  else renderLesson();
};

const renderLesson = function (): void {
  if (tutorials[tutorialNr].lessons.length == 0) return;
  if (lessonNr < 1 || lessonNr > tutorials[tutorialNr].lessons.length)
    lessonNr = 1;
  const lessonContent = tutorials[tutorialNr].lessons[lessonNr - 1].html;
  const common = tutorials[tutorialNr].common;
  const lesson = document.getElementById("lesson");
  lesson.innerHTML = "";
  lesson.append(...common, lessonContent);
  lesson.scrollTop = 0;
  // should we syntax highlight tutorials?

  autoRender(lesson);
  updateTutorialNav();
};

const markdownToHtml = function (markdownText) {
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

const ntutorials = 6; // weird hard-coding of initial tutorials TODO better

const initTutorials = function () {
  tutorialNr = null;
  lessonNr = 1;

  for (let i = 0; i < ntutorials; i++) {
    tutorials[i] = { render: false };
    loadLesson(i);
  }
};

const removeTutorial = function (index) {
  return function (e) {
    e.stopPropagation();
    e.currentTarget.parentElement.parentElement.remove();
    delete tutorials[index];
  };
};

export { initTutorials, renderLessonMaybe, removeTutorial, Tutorial };
