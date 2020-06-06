/* global fetch */

const cssClasses = {
  titleSymbolClass: "material-icons titleSymbol",
  titleSymbolActive: "expand_more",
  titleSymbolInactive: "expand_less",
  title: "mdl-button mdl-js-button mdl-button--raised mdl-list__item",
  titleHover: "mdl-button--colored",
  titleToggleClass: "",
  content: "mdl-list__item-text-body mdl-list__item",
  innerListItem: "unstyled",
  titleHref: "menuTitle mdl-button mdl-js-button mdl-button-raised",
  submenuHref: "submenuItem",
};

const toggleText = function (el, text) {
  el.innerHTML = text.replace(el.innerHTML, "");
};

const doUptutorialClick = function (e) {
  e.stopPropagation();
  const uptute = document.getElementById("uptutorial") as HTMLInputElement;
  uptute.value = "";
  uptute.click();
  return false;
};

function totalHeight(element) {
  const height = element.offsetHeight,
    style = window.getComputedStyle(element);

  return ["top", "bottom"]
    .map((side) => parseInt(style[`margin-${side}`]))
    .reduce((total, side) => total + side, height);
}

const childrenTotalHeight = function (element) {
  let height = 0;
  for (let i = 0; i < element.children.length; i++)
    height += totalHeight(element.children[i]);
  return height;
};

const appendTutorialToAccordion = function (
  tmptitle,
  blurb,
  lessons,
  index,
  showLesson,
  deleteButton = false
) {
  const title = tmptitle.cloneNode(false);
  title.className = cssClasses.title;
  const icon = document.createElement("i");
  icon.innerHTML = cssClasses.titleSymbolActive;
  icon.className = cssClasses.titleSymbolClass;
  const titleSpan = document.createElement("span");
  titleSpan.className = cssClasses.titleHref;
  if (index >= 0) titleSpan.setAttribute("data-tutorial", index);
  titleSpan.onclick = showLesson;
  titleSpan.innerHTML = tmptitle.innerHTML;
  title.appendChild(icon);
  title.appendChild(titleSpan);

  const div = document.createElement("div");
  div.innerHTML = blurb;
  div.insertBefore(title, div.firstChild);
  let heightClosed = 0;
  div.style.height = "0px";
  let f = function () {
    const h = totalHeight(title);
    if (h > 0) {
      heightClosed = 5 + h;
      div.style.height = heightClosed + "px";
    } else setTimeout(f, 1000);
  };
  setTimeout(f, 1);
  div.style.overflow = "hidden";
  div.style.transition = "height 0.5s";

  if (deleteButton) {
    const deleteButton = document.createElement("i");
    deleteButton.className = "material-icons icon-with-action saveDialogClose";
    deleteButton.innerHTML = "close";
    deleteButton.onclick = removeTutorial(div);
    title.appendChild(deleteButton);
  }

  title.onclick = function (e) {
    //        title.classList.toggle(cssClasses.titleToggleClass);
    toggleText(
      title.firstElementChild,
      cssClasses.titleSymbolActive + " " + cssClasses.titleSymbolInactive
    );
    div.style.height =
      (div.style.height == heightClosed + "px"
        ? childrenTotalHeight(div)
        : heightClosed) + "px";
    //	div.scrollIntoView(); // too brutal
  };
  const ul = document.createElement("ul");
  let li, a;
  for (let j = 0; j < lessons.length; j++) {
    li = document.createElement("li");
    li.className = cssClasses.innerListItem;
    a = document.createElement("a");
    a.href = "#"; // for the pointer on hover
    a.className = cssClasses.submenuHref;
    a.innerHTML = lessons[j].title;
    a.setAttribute("data-lesson", j);
    a.setAttribute("data-tutorial", index);
    a.onclick = showLesson;
    li.appendChild(a);
    ul.appendChild(li);
  }
  div.appendChild(ul);
  const el = document.getElementById("accordion");
  const lastel = document.getElementById("loadTutorialMenu");
  //    el.insertBefore(title,lastel);
  el.insertBefore(div, lastel);
  return div;
};

const appendLoadTutorialMenuToAccordion = function () {
  fetch("uploadTutorialHelp.txt", {
    credentials: "same-origin",
  })
    .then(function (response) {
      return response.text();
    })
    .then(function (content) {
      const title = document.createElement("h3");
      title.innerHTML = "Load Your Own Tutorial";
      appendTutorialToAccordion(title, content, [], -1, doUptutorialClick).id =
        "loadTutorialMenu";
    })
    .catch(function (error) {
      console.log("loading /uploadTutorialHelp.txt failed: " + error);
    });
};

const makeAccordion = function (tutorials, showLesson) {
  const accel = document.createElement("div");
  accel.id = "accordion";
  document.getElementById("home").appendChild(accel);
  for (let i = 0; i < tutorials.length; i++)
    appendTutorialToAccordion(
      tutorials[i].title,
      "",
      tutorials[i].lessons,
      i,
      showLesson
    );
  appendLoadTutorialMenuToAccordion();
};

const removeTutorial = function (el) {
  return function (e) {
    e.stopPropagation();
    el.remove();
  };
};

module.exports = function () {
  return {
    appendTutorialToAccordion,
    makeAccordion,
  };
};
