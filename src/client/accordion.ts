import uploadTutorialHelp from "./tutorials/uploadTutorialHelp.txt";
import { removeTutorial } from "./tutorials.ts";

const cssClasses = {
  titleSymbolClass: "material-icons titleSymbol",
  //  titleSymbolActive: "expand_more",
  titleSymbolActive: "arrow_right",
  //  titleSymbolInactive: "expand_less",
  // titleSymbolInactive: "arrow_drop_down",
  titleSymbolInactive: "arrow_right",
  title: "title mdl-button mdl-js-button mdl-button--raised mdl-list__item",
  titleHover: "mdl-button--colored",
  titleToggleClass: "rotated",
  content: "mdl-list__item-text-body mdl-list__item",
  innerList: "unstyled",
  titleHref: "menuTitle mdl-button mdl-js-button mdl-button-raised",
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
  title,
  blurb,
  lessons,
  index,
  deleteButton,
  clickAction = function (e) {
    e.stopPropagation();
  }
) {
  const titlespan = document.createElement("span"); //title.cloneNode(false);
  titlespan.className = cssClasses.title;
  const icon = document.createElement("i");
  icon.innerHTML = cssClasses.titleSymbolActive;
  icon.className = cssClasses.titleSymbolClass;
  const titlea = document.createElement("a");
  titlea.className = cssClasses.titleHref;
  if (index >= 0) {
    titlea.href = "#tutorial-" + index;
    titlea.target = "_self";
  } else titlea.tabIndex = 0; // still want focus
  titlea.onclick = clickAction;
  titlea.innerHTML = title.innerHTML;
  titlespan.append(icon, titlea);
  titlespan.style.cursor = "pointer";

  const div = document.createElement("div");
  div.style.overflow = "hidden";
  div.style.transition = "height 0.5s";
  div.style.paddingBottom = "5px";

  if (deleteButton) {
    const deleteButton = document.createElement("i");
    deleteButton.className = "material-icons";
    deleteButton.textContent = "close";
    deleteButton.onclick = removeTutorial(index);
    titlespan.appendChild(deleteButton);
  }

  div.appendChild(titlespan);

  const ul = document.createElement("ul");
  ul.className = cssClasses.innerList;
  ul.innerHTML = blurb;

  let heightClosed, heightOpen;
  titlespan.onclick = function () {
    titlespan.classList.toggle(cssClasses.titleToggleClass);
    if (ul.style.display == "none") {
      heightClosed = totalHeight(titlespan);
      div.style.height = heightClosed + "px";
      ul.style.display = "block";
      setTimeout(function () {
        heightOpen = childrenTotalHeight(div);
        div.style.height = heightOpen + "px";
      }, 1);
    } else
      div.style.height =
        (titlespan.classList.contains(cssClasses.titleToggleClass)
          ? heightOpen
          : heightClosed) + "px";
  };

  let li, a;
  for (let j = 0; j < lessons.length; j++) {
    li = document.createElement("li");
    a = document.createElement("a");
    a.innerHTML = lessons[j].title.innerHTML;
    a.href = "#tutorial-" + index + "-" + (j + 1);
    a.target = "_self";
    li.appendChild(a);
    ul.appendChild(li);
  }
  ul.style.display = "none";
  div.appendChild(ul);
  const el = document.getElementById("accordion");
  const lastel = document.getElementById("loadTutorialMenu");
  el.insertBefore(div, lastel);
  return div;
};

const appendLoadTutorialMenuToAccordion = function () {
  const title = document.createElement("h1");
  title.innerHTML = "Load Your Own Tutorial";
  appendTutorialToAccordion(
    title,
    uploadTutorialHelp,
    [],
    -1,
    false,
    doUptutorialClick
  ).id = "loadTutorialMenu";
};

const makeAccordion = function (tutorials) {
  for (let i = 0; i < tutorials.length; i++)
    appendTutorialToAccordion(
      tutorials[i].title,
      "",
      tutorials[i].lessons,
      i,
      false
    );
  appendLoadTutorialMenuToAccordion();
};

export { appendTutorialToAccordion, makeAccordion };
