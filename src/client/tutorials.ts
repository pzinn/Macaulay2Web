import { appendTutorialToAccordion, makeAccordion } from "./accordion";
import { autoRender } from "./autoRender";
import { mdToHTML } from "./md";

interface Lesson {
  title: HTMLElement; // <h1> element
  html: HTMLElement;
}

interface Tutorial {
  title: HTMLElement; // <h2> html element
  current: number;
  lessons: Lesson[];
}

const sliceTutorial = function (theHtml) {
  const result = {
    lessons: [],
    current: 0,
    title: null,
  };
  const tutorial = document.createElement("div");
  tutorial.innerHTML = theHtml;
  const children = tutorial.children;
  for (let i = 0; i < children.length; i++) {
    if (children[i].tagName == "TITLE") {
      result.title = document.createElement("h1");
      result.title.innerHTML = children[i].innerHTML;
    } else if (!result.title && children[i].tagName == "H1") {
      result.title = children[i];
    } else if (
      children[i].tagName == "DIV" &&
      children[i].childElementCount > 0
    )
      result.lessons.push({
        title: children[i].firstElementChild,
        html: children[i],
      });
  }
  return result;
};

import tutorialsList from "./tutorialsList";
const tutorials = tutorialsList.map(sliceTutorial);

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

const loadLesson = function (tutorialid: number, lessonid: number) {
  tutorialNr = tutorialid;
  lessonNr = lessonid;
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
  const file = this.files[0];
  console.log("file name: " + file.name);
  const reader = new FileReader();
  reader.readAsText(file);
  reader.onload = function (event) {
    let txt = event.target.result as string;
    if (file.name.substr(-3) == ".md") txt = markdownToHtml(txt); // by default, assume html
    const newTutorial = sliceTutorial(txt);
    const title = newTutorial.title; // this is a <title>
    if (!title) return; // ... or null, in which case cancel
    const i = tutorials.findIndex(
      (tute) => tute.title.textContent == title.textContent
    );
    if (i >= 0) {
      tutorials[i] = newTutorial; // replace existing tutorial with same name (really, should modify the accordion too, but who cares)
      if (tutorialNr == i) lessonNr = -1; // force reload
    } else {
      tutorials.push(newTutorial);
      const lastIndex = tutorials.length - 1;
      const lessons = newTutorial.lessons;
      appendTutorialToAccordion(title, "", lessons, lastIndex, true); // last arg = delete button
    }
  };
  return false;
};

export default function (initialTutorialNr, initialLessonNr) {
  if (initialTutorialNr) tutorialNr = initialTutorialNr;
  if (initialLessonNr) lessonNr = initialLessonNr;

  makeAccordion(tutorials);
  loadLesson(tutorialNr, lessonNr);

  // TODO: restructure this mess
  return {
    uploadTutorial,
    loadLessonIfChanged,
  };
}
