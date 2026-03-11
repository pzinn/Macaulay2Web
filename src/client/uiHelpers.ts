type ThemeMode = "day" | "night";

const getThemeButtonState = function (theme: ThemeMode): {
  icon: string;
  title: string;
} {
  if (theme === "night")
    return { icon: "light_mode", title: "Switch to day mode" };
  return { icon: "dark_mode", title: "Switch to night mode" };
};

const activateTabInContainer = function (
  tabsRoot: HTMLElement,
  loc: string
): boolean {
  tabsRoot
    .querySelectorAll(".app-panel.is-active")
    .forEach((el) => el.classList.remove("is-active"));
  tabsRoot
    .querySelectorAll(".app-tab.is-active")
    .forEach((el) => el.classList.remove("is-active"));

  const doc = tabsRoot.ownerDocument;
  const panel = doc.getElementById(loc);
  const tab = doc.getElementById(loc + "Title");
  if (!panel || !tab) return false;
  panel.classList.add("is-active");
  tab.classList.add("is-active");
  return true;
};

const computeResizeFlexBasis = function (
  startWidth: number,
  startX: number,
  currentX: number
): string {
  return startWidth + (currentX - startX) + "px";
};

export { getThemeButtonState, activateTabInContainer, computeResizeFlexBasis };
