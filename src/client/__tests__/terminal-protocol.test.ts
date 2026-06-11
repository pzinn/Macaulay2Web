import { beforeEach, describe, expect, it, vi } from "vitest";
import Prism from "prismjs";

vi.mock("../autoRender", () => ({
  autoRender: vi.fn(),
}));

vi.mock("../tutorials", () => ({
  processTutorialOutput: vi.fn(),
}));

import { webAppRegex, webAppTags } from "../../common/tags";
import { Shell } from "../terminal";

const position = (row: number) =>
  webAppTags.Position + `${row}:0` + webAppTags.End;

const inputCell = (lines: string[], discarded = false) => {
  let stream =
    webAppTags.Cell +
    webAppTags.Prompt +
    "i1" +
    webAppTags.End +
    " : " +
    webAppTags.Input +
    position(1);
  lines.forEach((line, index) => {
    stream += line + "\n" + webAppTags.InputEnd;
    if (index + 1 < lines.length)
      stream += webAppTags.InputContd + position(index + 2);
  });
  if (discarded) stream += webAppTags.InputDiscarded;
  return stream + webAppTags.CellEnd;
};

const setCaretAtEnd = (el: HTMLElement) => {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};

const setupShell = async () => {
  document.body.innerHTML = `
    <div id="terminalProcInput">
      <div id="terminalProcInputLines"></div>
    </div>
    <div id="terminal"></div>
    <div id="editorDiv"></div>
    <iframe id="browseFrame"></iframe>
  `;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const terminal = document.getElementById("terminal") as HTMLElement;
  const emitInput = vi.fn();
  const shell = new (Shell as any)(
    terminal,
    emitInput,
    undefined,
    document.getElementById("editorDiv"),
    document.getElementById("browseFrame"),
    true
  );
  return { shell, terminal, emitInput };
};

const pressUp = (terminal: HTMLElement) => {
  const input = terminal.querySelector(".M2CurrentInput") as HTMLElement;
  setCaretAtEnd(input);
  terminal.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
  );
  return input.textContent;
};

describe("terminal WebApp protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Prism.languages.macaulay2 = {};
  });

  it("finalizes ordinary input at CellEnd", async () => {
    const { shell, terminal } = await setupShell();
    shell.postMessage("1+1");

    shell.displayOutput(inputCell(["1+1"]));

    const processedLine = document.querySelector(
      ".terminalProcLine"
    ) as HTMLElement;
    expect(processedLine.classList.contains("is-complete")).toBe(true);
    expect(pressUp(terminal)).toBe("1+1");
  });

  it("keeps multiline input in one DOM block and history entry", async () => {
    const { shell, terminal } = await setupShell();
    const lines = ["scan(5,i->(", "i", "))"];

    shell.displayOutput(inputCell(lines));

    const pastInputs = terminal.querySelectorAll(".M2PastInput");
    expect(pastInputs).toHaveLength(1);
    expect(pastInputs[0].textContent).toBe(lines.join("\n") + "\n");
    expect(pressUp(terminal)).toBe(lines.join("\n"));
    expect(pressUp(terminal)).toBe(lines.join("\n"));
  });

  it("keeps semicolon-prefixed continued input together", async () => {
    const { shell, terminal } = await setupShell();
    const lines = ["L={}; scan(5,i->(", "i", "))"];

    shell.displayOutput(inputCell(lines));

    const pastInputs = terminal.querySelectorAll(".M2PastInput");
    expect(pastInputs).toHaveLength(1);
    expect(pastInputs[0].textContent).toBe(lines.join("\n") + "\n");
    expect(pressUp(terminal)).toBe(lines.join("\n"));
    expect(pressUp(terminal)).toBe(lines.join("\n"));
  });

  it("finishes only the discarded submission when another is queued", async () => {
    const { shell, terminal } = await setupShell();
    shell.postMessage("a=()->(\n\\\nblah\n)");
    shell.postMessage("next");

    shell.displayOutput(inputCell(["a=()->(", "\\"], true));

    const lines = Array.from(
      document.querySelectorAll(".terminalProcLine")
    ) as HTMLElement[];
    expect(lines).toHaveLength(5);
    expect(
      lines.slice(0, 4).every((line) => line.classList.contains("is-complete"))
    ).toBe(true);
    expect(lines[4].classList.contains("is-complete")).toBe(false);

    shell.displayOutput(inputCell(["next"]));
    expect(lines[4].classList.contains("is-complete")).toBe(true);
    expect(pressUp(terminal)).toBe("next");
    expect(pressUp(terminal)).toBe("a=()->(\n\\");
  });

  it("does not reserve an EvaluationEnd control character", () => {
    const htmlTag = String.fromCharCode(17);
    const formerEvaluationEndTag = String.fromCharCode(23);
    expect(webAppTags.EvaluationEnd).toBeUndefined();
    expect(htmlTag.split(webAppRegex)).toEqual(["", htmlTag, ""]);
    expect((htmlTag + formerEvaluationEndTag).split(webAppRegex)).toEqual([
      "",
      htmlTag,
      formerEvaluationEndTag,
    ]);
  });
});
