import { appendTutorialToAccordion, makeAccordion } from "./accordion";
import { autoRender } from "./autoRender";
import { mdToHTML } from "./md";

interface Lesson {
  title: HTMLElement; // <h1> element
  html: HTMLElement;
}

interface Tutorial {
  title: HTMLElement; // <h2> html element
  lessons: Lesson[];
  loaded: boolean;
}

const sliceTutorial = function (tutorial: Tutorial, theHtml: string) {
  const el = document.createElement("div");
  el.innerHTML = theHtml;
  const children = el.children;
  tutorial.lessons = [];
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

const h1 = function (s: string) {
  const el = document.createElement("h1");
  el.innerHTML = s;
  return el;
};

// for now, hardcoded
const tutorials = {
  "0": {
    title: h1("Welcome tutorial"),
    lessons: [],
    loaded: false,
  },
  "1": {
    title: h1("Basic introduction to Macaulay2"),
    lessons: [],
    loaded: false,
  },
  "2": {
    title: h1("Elementary uses of Groebner bases"),
    lessons: [],
    loaded: false,
  },
  "3": {
    title: h1("Mathematicians' introduction to Macaulay2"),
    lessons: [],
    loaded: false,
  },
  "4": {
    title: h1("More on the interface: the WebApp mode"),
    lessons: [],
    loaded: false,
  },
};

let lessonNr = 0;
let tutorialNr = 0;

const updateTutorialNav = function () {
  const prevBtn = document.getElementById("prevBtn") as HTMLButtonElement;
  const nextBtn = document.getElementById("nextBtn") as HTMLButtonElement;
  if (lessonNr > 0) {
    prevBtn.disabled = false;
    prevBtn.onclick = function () {
      document.location.hash = "tutorial-" + tutorialNr + "-" + lessonNr;
    };
  } else {
    prevBtn.disabled = true;
    prevBtn.onclick = null;
  }
  if (lessonNr < tutorials[tutorialNr].lessons.length - 1) {
    nextBtn.disabled = false;
    nextBtn.onclick = function () {
      document.location.hash = "tutorial-" + tutorialNr + "-" + (lessonNr + 2);
    };
  } else {
    nextBtn.disabled = true;
    nextBtn.onclick = null;
  }
  document.getElementById("lessonNr").innerHTML =
    " " + (lessonNr + 1) + "/" + tutorials[tutorialNr].lessons.length;
};

const loadLesson = function (newTutorialNr, newLessonNr: number) {
  tutorialNr = newTutorialNr;
  lessonNr = newLessonNr;
  if (!tutorials[tutorialNr])
    tutorials[tutorialNr] = { title: null, lessons: [], loaded: false };
  if (!tutorials[tutorialNr].loaded) {
    // now actually loads from file
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "tutorials/" + tutorialNr + ".html", true);
    xhr.onload = function () {
      sliceTutorial(tutorials[tutorialNr], xhr.responseText);
      tutorials[tutorialNr].loaded = true;
      // TODO: accordion
      displayLesson();
    };
    xhr.send(null);
  } else displayLesson();
};

const displayLesson = function () {
  if (tutorials[tutorialNr].lessons.length == 0) return; // not quite
  if (lessonNr < 0 || lessonNr >= tutorials[tutorialNr].lessons.length)
    lessonNr = 0;
  const lessonContent = tutorials[tutorialNr].lessons[lessonNr].html;
  const title = tutorials[tutorialNr].title;
  const lesson = document.getElementById("lesson");
  lesson.innerHTML = "";
  lesson.append(title, lessonContent);
  lesson.scrollTop = 0;
  // should we syntax highlight tutorials?

  autoRender(lesson);
  updateTutorialNav();
};

const loadLessonIfChanged = function (
  newTutorialNr,
  newLessonNr: number
): void {
  if (tutorialNr !== newTutorialNr || lessonNr !== newLessonNr)
    loadLesson(newTutorialNr, newLessonNr);
};

const markdownToHtml = function (markdownText) {
  const txt = mdToHTML(markdownText, null, "p");
  return txt.replace("</h1>", "</h1><div>").replace(/<h2>/g, "</div><div><h2>");
};

const uploadTutorial = function () {
  if (this.files.length == 0) return;
  const file = this.files[0];
  console.log("file name: " + file.name);
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
    // upload: should probably upload html instead TODO
    const req = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("files[]", file);
    formData.append("tutorial", "true"); // or whatever
    req.open("POST", "/upload");
    req.send(formData);

    const newTutorial: Tutorial = {
      lessons: [],
      loaded: true,
      title: null,
    };
    sliceTutorial(newTutorial, txt);
    const title = newTutorial.title; // this is a <title>
    if (!title) return; // ... or null, in which case cancel
    // TODO: if tutorial already exists, remove it first from accordion
    tutorials[fileName] = newTutorial;
    const lessons = newTutorial.lessons;
    appendTutorialToAccordion(title, "", lessons, fileName, true); // last arg = delete button
  };
  return false;
};

const initTutorials = function (initialTutorialNr, initialLessonNr) {
  tutorialNr = initialTutorialNr;
  lessonNr = initialLessonNr;

  makeAccordion(tutorials);
  if (tutorialNr) loadLesson(tutorialNr, lessonNr);
};

const removeTutorial = function (index) {
  return function (e) {
    e.stopPropagation();
    e.currentTarget.parentElement.parentElement.remove();
    tutorials[index] = null; // can't renumber :/
  };
};

export { initTutorials, uploadTutorial, loadLessonIfChanged, removeTutorial };
