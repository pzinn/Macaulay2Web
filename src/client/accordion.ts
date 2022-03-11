import { Tutorial, removeTutorial } from "./tutorials.ts";
import { stripId } from "./htmlTools.ts";

const cssClasses = {
  titleSymbolClass: "material-icons titleSymbol",
  //  titleSymbolActive: "expand_more",
  titleSymbolActive: "arrow_right",
  //  titleSymbolInactive: "expand_less",
  // titleSymbolInactive: "arrow_drop_down",
  titleSymbolInactive: "arrow_right",
  title:
    "accordionTitleBar mdl-button mdl-js-button mdl-button--raised mdl-list__item",
  titleHover: "mdl-button--colored",
  titleToggleClass: "rotated",
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

/*

function totalHeight(element) { // height including margins
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

*/

const appendTutorialToAccordion = function (
  tutorial: Tutorial,
  index,
  clickAction?
) {
  const id = "accordion-" + index;
  const div = document.getElementById(id);
  div.innerHTML = "";
  div.style.overflow = "hidden";
  div.style.transition = "height 0.5s";
  div.style.paddingBottom = "5px";
  div.style.height = "";

  const titlespan = document.createElement("span"); //title.cloneNode(false);
  titlespan.className = cssClasses.title;
  const icon = document.createElement("i");
  icon.innerHTML = cssClasses.titleSymbolActive;
  icon.className = cssClasses.titleSymbolClass;
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
  titlespan.append(icon, titlea);
  titlespan.style.cursor = "pointer";

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

  let heightClosed = -1,
    heightOpen;
  titlespan.onclick = function () {
    if (titlespan.classList.contains(cssClasses.titleToggleClass)) {
      // open -> closed
      titlespan.classList.remove(cssClasses.titleToggleClass);
      div.style.height = heightClosed + "px";
      setTimeout(function () {
        if (!titlespan.classList.contains(cssClasses.titleToggleClass))
          nav.style.display = "none"; // minor: prevents tabbing to closed menu items
      }, 500);
    } else {
      // closed -> open
      titlespan.classList.add(cssClasses.titleToggleClass);
      nav.style.display = "block";
      if (heightClosed < 0) {
        heightClosed = titlespan.offsetHeight; // the first time
        div.style.height = heightClosed + "px";
        setTimeout(function () {
          heightOpen = titlespan.offsetHeight + nav.offsetHeight; // okay as long as no margins
          div.style.height = heightOpen + "px";
        }, 1);
      } else div.style.height = heightOpen + "px";
    }
  };

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
  nav.style.display = "none";
  nav.appendChild(ul);
  div.appendChild(nav);
};

export { initAccordion, appendTutorialToAccordion };
