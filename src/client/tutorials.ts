import {
  appendTutorialToAccordion,
  appendLoadTutorialMenuToAccordion,
} from "./accordion";
import { autoRender } from "./autoRender";
import { mdToHTML, escapeHTML } from "./md";

interface Lesson {
  title: HTMLElement; // <h1> element
  html: HTMLElement;
}

interface Tutorial {
  title?: HTMLElement; // <h2> html element
  lessons: Lesson[];
}

const sliceTutorial = function (theHtml: string) {
  const tutorial: Tutorial = { lessons: [] };
  const el = document.createElement("div");
  el.innerHTML = theHtml;
  const children = el.children;
  for (let i = 0; i < children.length; i++) {
    if (children[i].tagName == "TITLE") {
      // rethink TODO
      tutorial.title = document.createElement("h1");
      tutorial.title.innerHTML = children[i].innerHTML;
    } else if (!tutorial.title && children[i].tagName == "H1") {
      tutorial.title = children[i] as HTMLElement;
    } else if (
      children[i].tagName == "DIV" &&
      children[i].childElementCount > 0
    ) {
      const lessonTitle = children[i].firstElementChild; // rethink TODO
      autoRender(lessonTitle);
      tutorial.lessons.push({
        title: lessonTitle as HTMLElement,
        html: children[i] as HTMLElement,
      });
    }
  }
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

const loadLesson = function (newTutorialNr, deleteButton) {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "tutorials/" + newTutorialNr + ".html", true);
  xhr.onload = function () {
    console.log("tutorial " + newTutorialNr + " loaded");
    const render = tutorials[newTutorialNr].render;
    tutorials[newTutorialNr] = sliceTutorial(xhr.responseText);
    appendTutorialToAccordion(
      tutorials[newTutorialNr].title,
      "",
      tutorials[newTutorialNr].lessons,
      newTutorialNr,
      deleteButton
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
    loadLesson(tutorialNr, true);
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
  const title = tutorials[tutorialNr].title;
  const lesson = document.getElementById("lesson");
  lesson.innerHTML = "";
  lesson.append(title, lessonContent);
  lesson.scrollTop = 0;
  // should we syntax highlight tutorials?

  autoRender(lesson);
  updateTutorialNav();
};

const markdownToHtml = function (markdownText) {
  const txt = mdToHTML(escapeHTML(markdownText), null, "p");
  return txt.replace("</h1>", "</h1><div>").replace(/<h2>/g, "</div><div><h2>");
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
    if (fileName.substr(-3) == ".md") {
      txt = markdownToHtml(txt); // by default, assume html
      fileName = fileName.substring(0, fileName.length - 3);
    } else if (fileName.substr(-5) == ".html")
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
    if (!newTutorial.title) return; // if no title, cancel
    tutorials[fileName] = newTutorial;
    if (tutorialNr == fileName) tutorialNr = null; // force reload
    appendTutorialToAccordion(
      newTutorial.title,
      "",
      newTutorial.lessons,
      fileName,
      true
    ); // last arg = delete button
  };
  return false;
};

const ntutorials = 5; // weird hard-coding of initial tutorials TODO better

const initTutorials = function () {
  tutorialNr = null;
  lessonNr = 1;

  for (let i = 0; i < ntutorials; i++) {
    tutorials[i] = { render: false };
    loadLesson(i, false);
  }
  appendLoadTutorialMenuToAccordion();
};

const removeTutorial = function (index) {
  return function (e) {
    e.stopPropagation();
    e.currentTarget.parentElement.parentElement.remove();
    delete tutorials[index];
  };
};

export { initTutorials, uploadTutorial, renderLessonMaybe, removeTutorial };
