declare const APP_MODE: "full" | "minimal" | "tutorial";

type AppMode = "full" | "minimal" | "tutorial";

const appMode: AppMode = APP_MODE;
const isFullMode = appMode === "full";
const isMinimalMode = appMode === "minimal";
const isTutorialMode = appMode === "tutorial";

export { AppMode, appMode, isFullMode, isMinimalMode, isTutorialMode };
