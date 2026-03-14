import { describe, expect, it } from "vitest";
import { activateTabInContainer } from "../uiHelpers";

describe("activateTabInContainer", () => {
  it("keeps only target tab and panel active", () => {
    document.body.innerHTML = `
      <div id="tabs">
        <a id="tutorialTitle" class="app-tab is-active"></a>
        <a id="editorTitle" class="app-tab"></a>
        <div id="tutorial" class="app-panel is-active"></div>
        <div id="editor" class="app-panel"></div>
      </div>
    `;
    const tabs = document.getElementById("tabs") as HTMLElement;

    const ok = activateTabInContainer(tabs, "editor");
    expect(ok).toBe(true);
    expect(document.getElementById("editor")?.classList.contains("is-active")).toBe(
      true
    );
    expect(
      document.getElementById("editorTitle")?.classList.contains("is-active")
    ).toBe(true);
    expect(
      document.getElementById("tutorial")?.classList.contains("is-active")
    ).toBe(false);
    expect(
      document.getElementById("tutorialTitle")?.classList.contains("is-active")
    ).toBe(false);
  });
});
