const setupMenu = function (menuElement, menuFunction, keyFunction?) {
  let menuSelection = menuElement.firstElementChild;
  if (!menuSelection) return;
  menuSelection.classList.add("selected");
  menuElement.onclick = function (e) {
    menuFunction(menuSelection);
    e.preventDefault();
    e.stopPropagation();
    return;
  };

  Array.from(menuElement.children).forEach((el) => {
    (el as HTMLElement).onmouseover = function () {
      menuSelection.classList.remove("selected");
      menuSelection = el;
      menuSelection.classList.add("selected");
    };
  });

  menuElement.onkeydown = function (e) {
    if (e.key === "Enter") {
      menuFunction(menuSelection);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key == "ArrowDown") {
      if (menuSelection != this.lastElementChild) {
        menuSelection.classList.remove("selected");
        menuSelection = menuSelection.nextElementSibling;
        menuSelection.classList.add("selected");
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key == "ArrowUp") {
      if (menuSelection != this.firstElementChild) {
        menuSelection.classList.remove("selected");
        menuSelection = menuSelection.previousElementSibling;
        menuSelection.classList.add("selected");
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key == "Escape") {
      menuSelection.classList.remove("selected");
      menuFunction(false);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
      if (keyFunction) keyFunction(e);
  };
  menuElement.focus();
  return function () {
    return menuSelection;
  };
};

export { setupMenu };
