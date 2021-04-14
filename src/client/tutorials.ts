import { appendTutorialToAccordion, makeAccordion } from "./accordion";
import { autoRender } from "./autoRender";
import { mdToHTML } from "./md";

interface Lesson {
  title: HTMLElement; // <h1> element
  html: HTMLElement;
}

interface Tutorial {
  fileName: string;
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
const tutorials: Tutorial[] = [
  {
    fileName: "0-welcome",
    title: h1("Welcome tutorial"),
    lessons: [],
    loaded: false,
  },
  {
    fileName: "1-gettingStarted",
    title: h1("Basic introduction to Macaulay2"),
    lessons: [],
    loaded: false,
  },
  {
    fileName: "2-elementary-groebner",
    title: h1("Elementary uses of Groebner bases"),
    lessons: [],
    loaded: false,
  },
  {
    fileName: "3-beginningM2",
    title: h1("Mathematicians' introduction to Macaulay2"),
    lessons: [],
    loaded: false,
  },
  {
    fileName: "4-interface",
    title: h1("More on the interface: the WebApp mode"),
    lessons: [],
    loaded: false,
  },
];

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

const loadLesson = function (newTutorialNr: number, newLessonNr: number) {
  tutorialNr = newTutorialNr;
  lessonNr = newLessonNr;
  if (!tutorials[tutorialNr].loaded) {
    // now actually loads from file
    const xhr = new XMLHttpRequest();
    xhr.open(
      "GET",
      "tutorials/" + tutorials[tutorialNr].fileName + ".html",
      true
    );
    xhr.onload = function () {
      sliceTutorial(tutorials[tutorialNr], xhr.responseText);
      tutorials[tutorialNr].loaded = true;
      displayLesson();
    };
    xhr.send(null);
  } else displayLesson();
};

const displayLesson = function () {
  if (tutorials[tutorialNr].lessons.length == 0) return; // not quite
  if (tutorialNr < 0 || tutorialNr >= tutorials.length) tutorialNr = 0;
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
  tutorialid: number,
  lessonid: number
): void {
  if (tutorialNr !== tutorialid || lessonNr !== lessonid)
    loadLesson(tutorialid, lessonid);
};

/*
const getTutorial = function (url) {
  return fetch(url, {
    credentials: "same-origin",
  })
    .then(
      function (response) {
        if (response.status !== 200) {
          throw new Error("Fetching tutorial failed: " + url);
        }
        return response.text();
      },
      function (error) {
        console.log("Error in fetch: " + error);
        throw error;
      }
    )
    .then(function (txt) {
      if (url.substr(-3) == ".md") txt = markdownToHtml(txt); // by default, assume html
      return txt;
    });
};
*/

/*
const makeTutorialsList = function (tutorialNames) {
  return Promise.all(tutorialNames.map(getTutorial))
    .then(function (rawTutorials) {
      return rawTutorials.map(sliceTutorial);
    })
    .then(function (data) {
      accordion.makeAccordion(data);
      tutorials = data;
      loadLesson(tutorialNr, lessonNr);
    })
    .catch(function (error) {
      console.log("Error in makeTutorialList: " + error);
    });
};
*/

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
      fileName: fileName,
      loaded: true,
      title: null,
    };
    sliceTutorial(newTutorial, txt);
    const title = newTutorial.title; // this is a <title>
    if (!title) return; // ... or null, in which case cancel
    const i = tutorials.findIndex(
      (tute) =>
        tute && tute.title && tute.title.textContent == title.textContent
    );
    if (i >= 0) {
      tutorials[i] = newTutorial; // replace existing tutorial with same name (really, should redo the accordion too -- TODO)
      if (tutorialNr == i) lessonNr = -1; // force reload
    } else {
      tutorials.push(newTutorial);
      const lastIndex = tutorials.length - 1;
      const lessons = newTutorial.lessons;
      appendTutorialToAccordion(title, "", lessons, fileName, true); // last arg = delete button
    }
  };
  return false;
};

const initTutorials = function (initialTutorialNr, initialLessonNr) {
  if (initialTutorialNr) tutorialNr = initialTutorialNr;
  if (initialLessonNr) lessonNr = initialLessonNr;

  makeAccordion(tutorials);
  if (tutorialNr >= 0 && tutorialNr < tutorials.length)
    loadLesson(tutorialNr, lessonNr);
};

const removeTutorial = function (index) {
  return function (e) {
    e.stopPropagation();
    e.currentTarget.parentElement.parentElement.remove();
    tutorials[index] = null; // can't renumber :/
  };
};

export { initTutorials, uploadTutorial, loadLessonIfChanged, removeTutorial };
