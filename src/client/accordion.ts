import { Tutorial, removeTutorial } from "./tutorials.ts";
import { stripId } from "./htmlTools.ts";

const cssClasses = {
  accordionItem: "accordion",
  titleSymbolClass: "material-icons accordionArrow",
  titleSymbolActive: "arrow_right",
  title: "accordionTitleBar",
  titleMdl: "mdl-button mdl-js-button mdl-button--raised mdl-list__item",
  titleHover: "mdl-button--colored",
  toggleClass: "accordionOpen",
  delayedToggleClass: "accordionDelayed",
  content: "mdl-list__item-text-body mdl-list__item",
  innerList: "accordionMenu",
  menuItem: "accordionMenuTitle",
  titleHref: "accordionTitle mdl-button mdl-js-button mdl-button-raised",
};

const initAccordion = function (index) {
  const id = "accordion-" + index;
  if (document.getElementById(id)) return;
  const div = document.createElement("div");
  div.id = id;
  document.getElementById("accordion").appendChild(div);
};

function totalHeight(element) {
  // height including margins
  const height = element.offsetHeight,
    style = window.getComputedStyle(element);

  return ["top", "bottom"]
    .map((side) => parseInt(style[`margin-${side}`]))
    .reduce((total, side) => total + side, height);
}

function innerHeight(element) {
  // height excluding padding
  const height = element.offsetHeight,
    style = window.getComputedStyle(element);
  return (
    height - (parseFloat(style.paddingTop) + parseFloat(style.paddingBottom))
  );
}

/*
const childrenTotalHeight = function (element) {
  let height = 0;
  for (let i = 0; i < element.children.length; i++)
    height += totalHeight(element.children[i]);
  return height;
};
*/

const addAccordionButton = function (div: HTMLElement) {
  const titlespan = div.firstElementChild as HTMLElement;
  titlespan.classList.add(cssClasses.title);
  const icon = document.createElement("i");
  icon.innerHTML = cssClasses.titleSymbolActive;
  icon.className = cssClasses.titleSymbolClass;
  let heightClosed = -1,
    heightOpen;
  titlespan.insertBefore(icon, titlespan.firstChild);
  titlespan.onclick = function () {
    if (div.classList.contains(cssClasses.toggleClass)) {
      // open -> closed
      heightOpen = innerHeight(div); // just in case it changed
      div.style.height = heightOpen + "px"; // for transition to kick in
      div.classList.remove(cssClasses.toggleClass);
      div.classList.add(cssClasses.delayedToggleClass);
      setTimeout(function () {
        div.style.height = heightClosed + "px";
      }, 1);
      setTimeout(function () {
        div.classList.remove(cssClasses.delayedToggleClass);
      }, 500);
    } else {
      // closed -> open
      if (heightClosed < 0) {
        heightClosed = innerHeight(div); // the first time
        div.classList.add(cssClasses.toggleClass);
        heightOpen = innerHeight(div);
        div.style.height = heightClosed + "px"; // for transition to kick in
        setTimeout(function () {
          div.style.height = heightOpen + "px";
        }, 1);
      } else {
        div.classList.add(cssClasses.toggleClass);
        div.style.height = heightOpen + "px";
      }
      setTimeout(function () {
        div.style.height = ""; // just in case it changes dynamically
      }, 500);
    }
  };
};

const appendTutorialToAccordion = function (
  tutorial: Tutorial,
  index,
  clickAction?
) {
  const id = "accordion-" + index;
  const div = document.getElementById(id);
  div.innerHTML = "";
  div.classList.add(cssClasses.accordionItem);

  const titlespan = document.createElement("span"); //title.cloneNode(false);
  titlespan.className = cssClasses.titleMdl;
  const titlea = document.createElement("a");
  titlea.className = cssClasses.titleHref;
  if (!clickAction) {
    titlea.href = "#tutorial-" + index;
    titlea.target = "_self";
    titlea.onclick = function (e) {
      e.stopPropagation();
    };
  } else {
    titlea.tabIndex = 0; // still want focus
    titlea.onclick = clickAction;
  }
  const title = tutorial.body.querySelector("title,header");
  titlea.innerHTML = title ? title.innerHTML : index; // use index as default title
  stripId(titlea);
  titlespan.append(titlea);

  const deleteButton = document.createElement("i");
  deleteButton.className = "material-icons";
  deleteButton.textContent = "close";
  deleteButton.onclick = removeTutorial(index);
  deleteButton.style.fontSize = "1em";
  titlespan.appendChild(deleteButton);

  const navl = tutorial.body.getElementsByTagName("nav");
  const nav = navl.length > 0 ? navl[0] : document.createElement("nav");

  div.appendChild(titlespan);

  const ul = document.createElement("ul");
  ul.className = cssClasses.innerList;

  let li, a;
  for (let j = 0; j < tutorial.lessons.length; j++) {
    const lessonTitle = (tutorial.lessons[j] as HTMLElement).querySelector(
      "header"
    );
    if (lessonTitle) {
      li = document.createElement("li");
      a = document.createElement("a");
      a.innerHTML = lessonTitle.innerHTML;
      stripId(a);
      a.href = "#tutorial-" + index + "-" + (j + 1);
      a.target = "_self";
      a.className = cssClasses.menuItem;
      li.appendChild(a);
      ul.appendChild(li);
    }
  }
  nav.appendChild(ul);
  div.appendChild(nav);
  addAccordionButton(div);
};

export { initAccordion, appendTutorialToAccordion, addAccordionButton };
