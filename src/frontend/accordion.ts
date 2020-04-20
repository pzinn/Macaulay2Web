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
};

const scrollDownUntilTutorialVisible = function(el) {
    /*
  const y = $(this).position().top;
  const height = parseInt($("#home").css("height"), 10);
  const totalHeight = parseInt($(this).css("height"), 10) + 50;
  if (height - y < totalHeight) {
    const scroll = totalHeight - height + y;
    $("#home").animate({
      scrollTop: ($("#home").scrollTop() + scroll),
    }, 400);
  }
    */
    //TODO
};

const appendTutorialToAccordion = function(tmptitle, lessons, index, showLesson) {
    const title = document.createElement("h3");
    title.className = cssClasses.title;
    const icon = document.createElement("i");
    icon.innerHTML = cssClasses.titleSymbolActive;
    icon.className = cssClasses.titleSymbolClass;
    tmptitle.className = cssClasses.titleHref;
    tmptitle.setAttribute("data-tutorial",index);
    title.appendChild(icon);
    title.appendChild(tmptitle);
    tmptitle.onclick=showLesson;

    var div=document.createElement("div");
    div.style.height="0px";
    div.style.overflow="hidden";
    div.style.transition="height 0.5s";

    title.onclick = function(e) {
	//        title.classList.toggle(cssClasses.titleToggleClass);
	toggleText(title.firstElementChild,cssClasses.titleSymbolActive + " " +cssClasses.titleSymbolInactive);
	div.style.height= div.style.height == "0px" ? (div.firstElementChild.clientHeight+30)+"px" : "0px";
	scrollDownUntilTutorialVisible(div);
    }
    const ul=document.createElement("ul");
    var li,a;
    for (let j = 0; j < lessons.length; j++) {
	li=document.createElement("li");
	li.className = cssClasses.innerListItem;
	a=document.createElement("a");
	a.href="#";
	a.className = cssClasses.submenuHref;
	a.innerHTML = lessons[j].title;
	a.setAttribute("data-lesson",j);
	a.setAttribute("data-tutorial",index);
	a.onclick = showLesson;
	li.appendChild(a);
	ul.appendChild(li);
    }
    div.appendChild(ul);
    var el = document.getElementById("accordion");
    var lastel = document.getElementById("loadTutorialMenu");
    el.insertBefore(title,lastel);
    el.insertBefore(div,lastel);
}

const appendLoadTutorialTitleToAccordion = function() {
    const title = document.createElement("h3");
    title.id="loadTutorialMenu";
    title.className=cssClasses.title;
    document.getElementById("accordion").appendChild(title);
};

const appendInstructionsToAccordion = function() {
  const instructions = document.createElement("div");

  fetch("uploadTutorialHelp.txt", {
    credentials: "same-origin",
  }).then(function(response) {
    return response.text();
  }).then(function(content) {
    instructions.innerHTML=content;
  }).catch(function(error) {
    console.log("loading /uploadTutorialHelp.txt failed: " + error);
  });
  instructions.id="loadTutorialInstructions";
    instructions.className=cssClasses.content;
    instructions.style.display="none";
    document.getElementById("accordion").appendChild(instructions);
};

const addExpandLoadTutorialInstructionsButton = function() {
  const expandButton = document.createElement("i");
  expandButton.className=cssClasses.titleSymbolClass;
  expandButton.innerHTML=cssClasses.titleSymbolActive;
  expandButton.onclick = function() {
      const title = document.getElementById("loadTutorialMenu");
      const instructions = document.getElementById("loadTutorialInstructions");
      toggleText(expandButton,cssClasses.titleSymbolInactive + " " + cssClasses.titleSymbolActive);
//      title.classList.toggle(cssClasses.titleToggleClass);
      instructions.style.display=instructions.style.display == "" ? "none" : ""; // TODO: smooth animation
      scrollDownUntilTutorialVisible(instructions);
  };
  document.getElementById("loadTutorialMenu").appendChild(expandButton);
};

const addLoadTutorialButton = function() {
  const loadTutorialButton = document.createElement("a");
    loadTutorialButton.id="loadTutorialButton";
    loadTutorialButton.innerHTML="Load Your Own Tutorial";
  // loadTutorialButton has no tutorial attached, that can be loaded on click.
    loadTutorialButton.className=cssClasses.titleHref.replace("menuTitle", "");
    document.getElementById("loadTutorialMenu").appendChild(loadTutorialButton);
    document.getElementById("loadTutorialButton").onclick=doUptutorialClick;
};

const appendLoadTutorialMenuToAccordion = function() {
  appendLoadTutorialTitleToAccordion();
  appendInstructionsToAccordion();
  addExpandLoadTutorialInstructionsButton();
  addLoadTutorialButton();
};

const makeAccordion = function(tutorials, showLesson) {
    var accel = document.createElement("div");
    accel.id="accordion";
    document.getElementById("home").appendChild(accel);
    appendLoadTutorialMenuToAccordion();
    for (let i = 0; i < tutorials.length; i++)
	appendTutorialToAccordion(tutorials[i].title, tutorials[i].lessons, i, showLesson);
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
