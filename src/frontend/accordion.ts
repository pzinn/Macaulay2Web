/* global fetch */

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
  tmptitle,
  blurb,
  lessons,
  index,
  deleteButton,
  clickAction = function (e) {
    e.stopPropagation();
  }
) {
  const title = tmptitle.cloneNode(false);
  title.className = cssClasses.title;
  const icon = document.createElement("i");
  icon.innerHTML = cssClasses.titleSymbolActive;
  icon.className = cssClasses.titleSymbolClass;
  const titlea = document.createElement("a");
  titlea.className = cssClasses.titleHref;
  if (index >= 0) {
    titlea.href = "#tutorial-" + index;
    titlea.target = "_self";
  }
  titlea.onclick = clickAction;
  titlea.innerHTML = tmptitle.innerHTML;
  title.appendChild(icon);
  title.appendChild(titlea);
  title.style.cursor = "pointer";

  const div = document.createElement("div");
  div.insertBefore(title, div.firstChild);
  div.style.overflow = "hidden";
  div.style.transition = "height 0.5s";
  div.style.paddingBottom = "5px";

  if (deleteButton) {
    const deleteButton = document.createElement("i");
    deleteButton.className = "material-icons saveDialogClose";
    deleteButton.innerHTML = "close";
    deleteButton.onclick = removeTutorial(div);
    title.appendChild(deleteButton);
  }

  const ul = document.createElement("ul");
  ul.className = cssClasses.innerList;
  ul.innerHTML = blurb;

  let heightClosed, heightOpen;
  title.onclick = function () {
    title.classList.toggle(cssClasses.titleToggleClass);
    if (ul.style.display == "none") {
      heightClosed = totalHeight(title);
      div.style.height = heightClosed + "px";
      ul.style.display = "block";
      setTimeout(function () {
        heightOpen = childrenTotalHeight(div);
        div.style.height = heightOpen + "px";
      }, 1);
    } else
      div.style.height =
        (title.classList.contains(cssClasses.titleToggleClass)
          ? heightOpen
          : heightClosed) + "px";
  };

  let li, a;
  for (let j = 0; j < lessons.length; j++) {
    li = document.createElement("li");
    a = document.createElement("a");
    a.innerHTML = lessons[j].title;
    a.href = "#tutorial-" + index + "-" + (j + 1);
    a.target = "_self";
    li.appendChild(a);
    ul.appendChild(li);
  }
  ul.style.display = "none";
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
      appendTutorialToAccordion(
        title,
        content,
        [],
        -1,
        false,
        doUptutorialClick
      ).id = "loadTutorialMenu";
    })
    .catch(function (error) {
      console.log("loading /uploadTutorialHelp.txt failed: " + error);
    });
};

const makeAccordion = function (tutorials) {
  const accel = document.createElement("div");
  accel.id = "accordion";
  document.getElementById("home").appendChild(accel);
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
