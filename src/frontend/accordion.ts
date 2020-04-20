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

const toggleText = function(el,text) {
    el.innerHTML=text.replace(el.innerHTML,"");
}

const doUptutorialClick = function() {
    const uptute=document.getElementById("uptutorial") as HTMLInputElement;
    uptute.value="";
    uptute.click();
    return false;
};

const appendTutorialToAccordion = function(tmptitle, blurb, lessons, index, showLesson) {
    const title = document.createElement("h3");
    title.className = cssClasses.title;
    const icon = document.createElement("i");
    icon.innerHTML = cssClasses.titleSymbolActive;
    icon.className = cssClasses.titleSymbolClass;
    const titlea = document.createElement("a");
    titlea.className = cssClasses.titleHref;
    if (index>=0) titlea.setAttribute("data-tutorial",index);
    titlea.onclick=showLesson;
    titlea.href="#";
    titlea.innerHTML=tmptitle;
    title.appendChild(icon);
    title.appendChild(titlea);

    var div=document.createElement("div");
    div.style.height="0px";
    div.style.overflow="hidden";
    div.style.transition="height 0.5s";
    div.innerHTML = blurb;

    title.onclick = function(e) {
	//        title.classList.toggle(cssClasses.titleToggleClass);
	toggleText(title.firstElementChild,cssClasses.titleSymbolActive + " " +cssClasses.titleSymbolInactive);
	div.style.height= div.style.height == "0px" ? (div.firstElementChild.clientHeight+30)+"px" : "0px";
//	div.scrollIntoView(); // too brutal
    }
    const ul=document.createElement("ul");
    var li,a;
    for (let j = 0; j < lessons.length; j++) {
	li=document.createElement("li");
	li.className = cssClasses.innerListItem;
	a=document.createElement("a");
	a.href="#"; // for the pointer on hover
	a.className = cssClasses.submenuHref;
	a.innerHTML = lessons[j].title;
	a.setAttribute("data-lesson",j);
	a.setAttribute("data-tutorial",index);
	a.onclick = showLesson;
	li.appendChild(a);
	ul.appendChild(li);
    }
    div.appendChild(ul);
    const el = document.getElementById("accordion");
    el.appendChild(title);
    el.appendChild(div);
}

const appendLoadTutorialMenuToAccordion = function() {
  fetch("uploadTutorialHelp.txt", {
    credentials: "same-origin",
  }).then(function(response) {
    return response.text();
  }).then(function(content) {
    appendTutorialToAccordion("Load Your Own Tutorial",content,[],-1,doUptutorialClick);
  }).catch(function(error) {
    console.log("loading /uploadTutorialHelp.txt failed: " + error);
  });
};

const makeAccordion = function(tutorials, showLesson) {
    var accel = document.createElement("div");
    accel.id="accordion";
    document.getElementById("home").appendChild(accel);
    for (let i = 0; i < tutorials.length; i++)
	appendTutorialToAccordion(tutorials[i].title.innerHTML, "",tutorials[i].lessons, i, showLesson);
    appendLoadTutorialMenuToAccordion();
};

const removeTutorial = function(title, div, button) {
  return function() {
    button.remove();
    div.remove();
    title.remove();
  };
};

const insertDeleteButtonAtLastTutorial = function(tutorialMenu) {
  const lastDiv = tutorialMenu.previousElementSibling;
  const lastTitle = lastDiv.previousElementSibling;
  const deleteButton = document.createElement("i");
  deleteButton.className="material-icons icon-with-action saveDialogClose";
  deleteButton.innerHTML="close";
  lastTitle.appendChild(deleteButton);
    deleteButton.onclick= removeTutorial(lastTitle, lastDiv, deleteButton);
};

module.exports = function() {
  return {
    appendTutorialToAccordion,
    makeAccordion,
    insertDeleteButtonAtLastTutorial,
  };
};
