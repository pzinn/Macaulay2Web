import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../extra", () => ({
  openTutorialInEditor: vi.fn(),
}));

type MockResponse = { status: number; body: string };

class MockXHR {
  static routes: Record<string, MockResponse> = {};
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 0;
  responseText = "";
  method = "";
  url = "";

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send() {
    const route = MockXHR.routes[this.url];
    if (!route) {
      this.status = 404;
      this.responseText = "";
      this.onload?.();
      return;
    }
    this.status = route.status;
    this.responseText = route.body;
    this.onload?.();
  }
}

const tutorialHtml = function (title: string, nLessons = 1): string {
  const lessons = Array.from({ length: nLessons }, (_, i) => {
    const j = i + 1;
    return `<section><header><h2>${title} ${j}</h2></header><p>Lesson ${j}</p></section>`;
  }).join("");
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body>${lessons}</body></html>`;
};

const installTutorialRoutes = function () {
  MockXHR.routes = {
    "tutorials/welcome.html": { status: 200, body: tutorialHtml("Welcome") },
    "tutorials/basic.html": { status: 200, body: tutorialHtml("Basic") },
    "tutorials/groebner.html": { status: 200, body: tutorialHtml("Groebner") },
    "tutorials/math.html": { status: 200, body: tutorialHtml("Math") },
    "tutorials/interface.html": { status: 200, body: tutorialHtml("Interface") },
    "tutorials/sample.html": { status: 200, body: tutorialHtml("Sample", 2) },
  };
};

const setupTutorialDom = function () {
  document.body.innerHTML = `
    <div id="accordion"></div>
    <button id="loadTutorialBtn"></button>
    <div id="tutorial"></div>
    <div id="lesson"></div>
    <button id="prevBtn"></button>
    <button id="nextBtn"></button>
    <span id="lessonNr"></span>
    <button id="runAllTute"></button>
    <button id="fullscreenTute"></button>
  `;
};

describe("tutorials integration", () => {
  beforeEach(() => {
    vi.resetModules();
    setupTutorialDom();
    installTutorialRoutes();
    (globalThis as any).XMLHttpRequest = MockXHR;
  });

  it("loads starting tutorials into accordion", async () => {
    const { initTutorials } = await import("../tutorials");
    initTutorials();
    expect(document.getElementById("accordion-welcome")).not.toBeNull();
    expect(document.getElementById("accordion-sample")).not.toBeNull();
  });

  it("wires Load Tutorial button to hidden file input click", async () => {
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
    const { initTutorials } = await import("../tutorials");
    initTutorials();
    (document.getElementById("loadTutorialBtn") as HTMLButtonElement).click();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("maps ArrowRight to next lesson in tutorial fullscreen mode", async () => {
    const { initTutorials, renderLessonMaybe } = await import("../tutorials");
    initTutorials();
    renderLessonMaybe("sample", 1);

    const tutorialEl = document.getElementById("tutorial") as HTMLElement;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => tutorialEl,
    });

    window.location.hash = "#tutorial-sample-1";
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(window.location.hash).toContain("tutorial-sample-2");
  });
});
