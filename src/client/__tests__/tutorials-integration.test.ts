import { beforeEach, describe, expect, it, vi } from "vitest";

type MockResponse = { status: number; body: string };

class MockXHR {
  static routes: Record<string, MockResponse> = {};
  static requests: string[] = [];
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
    MockXHR.requests.push(this.url);
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

const unfoldedTutorialHtml = `
  <section>
    <header><h2>Unfolded tutorial</h2></header>
    <p>Introduction</p>
    <hr><p>First reveal</p>
    <hr><p>Second reveal</p>
  </section>
`;

const foldingTutorialHtml = `
  <section>
    <header><h2>Folding tutorial 1</h2></header>
    <p>Introduction</p>
    <hr><p>First reveal</p>
    <hr><p>Second reveal</p>
  </section>
  <section>
    <header><h2>Folding tutorial 2</h2></header>
    <p>Introduction</p>
    <hr><p>Another reveal</p>
  </section>
`;

const nestedBreakTutorialHtml = `
  <section>
    <header><h2>Nested break tutorial</h2></header>
    <div>
      <p>Nested content</p>
      <hr id="nested-break"><p id="nested-following">Still introductory</p>
    </div>
    <hr id="lesson-break"><p id="lesson-reveal">First reveal</p>
  </section>
`;

const installTutorialRoutes = function () {
  MockXHR.routes = {
    "tutorials/welcome.html": { status: 200, body: tutorialHtml("Welcome") },
    "tutorials/basic.html": { status: 200, body: tutorialHtml("Basic") },
    "tutorials/groebner.html": { status: 200, body: tutorialHtml("Groebner") },
    "tutorials/math.html": { status: 200, body: tutorialHtml("Math") },
    "tutorials/interface.html": {
      status: 200,
      body: tutorialHtml("Interface"),
    },
    "tutorials/sample.html": { status: 200, body: tutorialHtml("Sample", 2) },
    "tutorials/unfolded.html": { status: 200, body: unfoldedTutorialHtml },
    "tutorials/folding.html": { status: 200, body: foldingTutorialHtml },
    "tutorials/nested.html": { status: 200, body: nestedBreakTutorialHtml },
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
    <p id="tutorialError" hidden></p>
  `;
};

describe("tutorials integration", () => {
  beforeEach(() => {
    vi.resetModules();
    window.history.replaceState(null, "", "/");
    setupTutorialDom();
    installTutorialRoutes();
    MockXHR.requests = [];
    (globalThis as any).XMLHttpRequest = MockXHR;
    HTMLElement.prototype.scrollIntoView = vi.fn();
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

  it("uses arrow keys to unfold and fold separators before changing lessons", async () => {
    const { initTutorials, renderLessonMaybe } = await import("../tutorials");
    initTutorials({
      startingTutorials: ["welcome"],
      useAccordion: false,
      allowUpload: false,
    });
    renderLessonMaybe("folding", 1);

    const tutorialEl = document.getElementById("tutorial") as HTMLElement;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => tutorialEl,
    });
    window.location.hash = "#tutorial-folding-1";
    const lesson = document.querySelector(
      "section.current-lesson"
    ) as HTMLElement;
    const breaks = Array.from(lesson.querySelectorAll("hr"));

    expect(breaks.every((hr) => hr.classList.contains("closed"))).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(breaks[0].classList.contains("closed")).toBe(false);
    expect(breaks[1].classList.contains("closed")).toBe(true);
    expect(window.location.hash).toBe("#tutorial-folding-1");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(breaks.every((hr) => !hr.classList.contains("closed"))).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(breaks[0].classList.contains("closed")).toBe(false);
    expect(breaks[1].classList.contains("closed")).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(window.location.hash).toBe("#tutorial-folding-2");

    renderLessonMaybe("folding", 2);
    window.location.hash = "#tutorial-folding-2";
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(window.location.hash).toBe("#tutorial-folding-1");
  });

  it("ignores hr elements nested below the lesson level", async () => {
    const { initTutorials, renderLessonMaybe } = await import("../tutorials");
    initTutorials({
      startingTutorials: ["welcome"],
      useAccordion: false,
      allowUpload: false,
      standalone: true,
    });
    renderLessonMaybe("nested", 1);

    const nestedBreak = document.getElementById("nested-break");
    const lessonBreak = document.getElementById("lesson-break");
    expect(nestedBreak?.classList.contains("separator")).toBe(false);
    expect(nestedBreak?.classList.contains("closed")).toBe(false);
    expect(document.getElementById("nested-following")?.style.display).toBe("");
    expect(lessonBreak?.classList.contains("separator")).toBe(true);
    expect(lessonBreak?.classList.contains("closed")).toBe(true);
    expect(document.getElementById("lesson-reveal")?.style.display).toBe(
      "none"
    );
  });

  it("parses standalone tutorial routes and rejects unsafe hashes", async () => {
    const { parseTutorialHash } = await import("../tutorials");
    expect(parseTutorialHash("#tutorial-basic-3")).toEqual({
      tutorial: "basic",
      lesson: 3,
    });
    expect(parseTutorialHash("#tutorial-my-tutorial-2")).toEqual({
      tutorial: "my-tutorial",
      lesson: 2,
    });
    expect(parseTutorialHash("#tutorial-../../etc/passwd-1")).toEqual({
      tutorial: "welcome",
      lesson: 1,
    });
  });

  it("loads only the requested tutorial in standalone mode", async () => {
    const { initTutorials, renderLessonMaybe } = await import("../tutorials");
    initTutorials({
      startingTutorials: ["welcome"],
      useAccordion: false,
      allowUpload: false,
      standalone: true,
    });
    renderLessonMaybe("sample", 2);

    expect(MockXHR.requests).toEqual(["tutorials/sample.html"]);
    expect(document.getElementById("accordion-sample")).toBeNull();
    expect(document.getElementById("lessonNr")?.textContent).toContain("2/2");
  });

  it("reveals every hr-delimited section in unfold mode", async () => {
    const { initTutorials, renderLessonMaybe } = await import("../tutorials");
    window.history.replaceState(null, "", "/?unfold");
    initTutorials({
      startingTutorials: ["welcome"],
      useAccordion: false,
      allowUpload: false,
      standalone: true,
    });
    renderLessonMaybe("unfolded", 1);

    const lesson = document.querySelector("section.current-lesson");
    expect(lesson?.querySelectorAll("hr.closed")).toHaveLength(0);
    expect(
      Array.from(lesson?.children || []).every(
        (child: HTMLElement) => child.style.display !== "none"
      )
    ).toBe(true);
  });

  it("places standalone tutorial output beside the code that produced it", async () => {
    const { initTutorials, processTutorialOutput } = await import(
      "../tutorials"
    );
    initTutorials({
      startingTutorials: ["welcome"],
      useAccordion: false,
      allowUpload: false,
      standalone: true,
    });
    const code = document.createElement("code");
    code.textContent = "2+2";
    document.getElementById("lesson")?.appendChild(code);
    const cell = document.createElement("div");
    cell.className = "M2Cell";
    cell.append("input", document.createElement("br"), "4");

    processTutorialOutput(cell, code);

    const output = code.nextElementSibling as HTMLElement;
    expect(output?.classList.contains("M2Inline")).toBe(true);
    expect(output?.textContent).toBe("4");
  });
});
