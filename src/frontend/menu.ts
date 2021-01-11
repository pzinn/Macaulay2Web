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
      menuFunction(menuSelection);
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
      menuFunction(false);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (keyFunction) keyFunction(e);
  };
  menuElement.focus();
  return changeSelection;
};

export { setupMenu };
