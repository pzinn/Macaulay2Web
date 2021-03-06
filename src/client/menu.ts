const setupMenu = function (menuElement, menuFunction, keyFunction?) {
  let menuSelection = menuElement.firstElementChild;
  if (!menuSelection) return;
  const wrapMenuFunction = function (arg, success) {
    menuElement.onblur = null; // do this first to avoid bugs with remove
    menuFunction(arg, success);
  };

  menuSelection.classList.add("selected");
  menuElement.onclick = function (e) {
    wrapMenuFunction(menuSelection, true);
    e.preventDefault();
    e.stopPropagation();
    return;
  };

  const changeSelection = function (newSelection?) {
    if (newSelection) {
      if (menuSelection) menuSelection.classList.remove("selected");
      menuSelection = newSelection;
      menuSelection.classList.add("selected");
    }
    return menuSelection;
  };
  Array.from(menuElement.children).forEach((el) => {
    (el as HTMLElement).onmouseover = () => {
      changeSelection(el);
    };
  });

  menuElement.onkeydown = function (e) {
    if (e.key === "Enter") {
      wrapMenuFunction(menuSelection, true);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key == "ArrowDown") {
      if (menuSelection != this.lastElementChild)
        changeSelection(menuSelection.nextElementSibling);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key == "ArrowUp") {
      if (menuSelection != this.firstElementChild)
        changeSelection(menuSelection.previousElementSibling);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key == "Escape") {
      menuSelection.classList.remove("selected");
      wrapMenuFunction(false, true);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (keyFunction) keyFunction(e);
  };
  menuElement.focus();
  menuElement.onblur = function () {
    wrapMenuFunction(false, false);
  };
  return changeSelection;
};

export { setupMenu };
