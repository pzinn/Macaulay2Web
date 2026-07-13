import { beforeEach, describe, expect, it, vi } from "vitest";
import Prism from "prismjs";

vi.mock("../autoRender", () => ({
  autoRender: vi.fn(),
}));

vi.mock("../tutorials", () => ({
  processTutorialOutput: vi.fn(),
}));

vi.mock("../main", () => ({
  clientId: "test",
  myshell: null,
  socket: null,
  url: new URL("http://localhost/"),
}));

import { webAppRegex, webAppTags } from "../../common/tags";
import { linkPastInputFileNames } from "../extra";
import { Shell } from "../terminal";
import { processTutorialOutput } from "../tutorials";

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

const setupShell = async (
  postProcessPastInput?: (input: HTMLElement) => void,
  createInputSpan = true
) => {
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
    createInputSpan,
    postProcessPastInput
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

  it("returns completed output to standalone tutorial code", async () => {
    const { shell } = await setupShell(undefined, false);
    const code = document.createElement("code");
    code.textContent = "1+1";
    document.body.appendChild(code);

    shell.postMessage("1+1", code);
    shell.displayOutput(inputCell(["1+1"]));

    expect(processTutorialOutput).toHaveBeenCalledOnce();
    expect(processTutorialOutput).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      code
    );
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

  it("preserves multiline input when output arrives in several chunks", async () => {
    const { shell, terminal } = await setupShell();
    const lines = ["scan(5,i->(", "i", "))"];
    const stream = inputCell(lines);
    const boundaries = [
      stream.indexOf("scan") + 2,
      stream.indexOf(webAppTags.InputContd) + 1,
      stream.lastIndexOf(webAppTags.CellEnd),
    ];

    shell.displayOutput(stream.slice(0, boundaries[0]));
    shell.displayOutput(stream.slice(boundaries[0], boundaries[1]));
    shell.displayOutput(stream.slice(boundaries[1], boundaries[2]));
    shell.displayOutput(stream.slice(boundaries[2]));

    const pastInputs = terminal.querySelectorAll(".M2PastInput");
    expect(pastInputs).toHaveLength(1);
    expect(pastInputs[0].textContent).toBe(lines.join("\n") + "\n");
    expect(pressUp(terminal)).toBe(lines.join("\n"));
  });

  it("does not add input embedded in help output to history", async () => {
    const { shell, terminal } = await setupShell();

    shell.displayOutput(
      webAppTags.Html + inputCell(["example input"]) + webAppTags.End
    );

    expect(terminal.querySelector(".M2PastInput")?.textContent).toBe(
      "example input\n"
    );
    expect(pressUp(terminal)).toBe("");
  });

  it("adds editor badges to M2 file strings in past input", async () => {
    Prism.languages.macaulay2 = {
      string: /"(?:\\[\s\S]|(?!")[^\\])*"/,
    };
    const { shell, terminal } = await setupShell(linkPastInputFileNames);

    shell.displayOutput(
      inputCell([
        'load "myfile.m2"; print "dir/other file.m2"; needsPackage "Graphs"',
      ])
    );

    const links = Array.from(
      terminal.querySelectorAll(".M2PastInput a.editor-file-link")
    ) as HTMLAnchorElement[];
    expect(links.map((link) => link.textContent)).toEqual(["", ""]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#editor:myfile.m2",
      "#editor:dir/other%20file.m2",
    ]);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Open myfile.m2 in editor",
      "Open dir/other file.m2 in editor",
    ]);
    expect(terminal.querySelector(".M2PastInput").textContent).toBe(
      'load "myfile.m2"; print "dir/other file.m2"; needsPackage "Graphs"\n'
    );
    expect(
      (terminal.querySelector(".M2PastInput") as HTMLElement).dataset.m2code
    ).toBe(
      'load "myfile.m2"; print "dir/other file.m2"; needsPackage "Graphs"\n'
    );
  });

  it("does not add editor badges to non-M2 strings", async () => {
    Prism.languages.macaulay2 = {
      string: /"(?:\\[\s\S]|(?!")[^\\])*"/,
    };
    const { shell, terminal } = await setupShell(linkPastInputFileNames);

    shell.displayOutput(inputCell(['print "README"; load "file.txt"']));

    expect(
      terminal.querySelector(".M2PastInput a.editor-file-link")
    ).toBeNull();
  });

  it("does not let input embedded in help complete pending user input", async () => {
    const { shell } = await setupShell();
    shell.postMessage("pending()");

    shell.displayOutput(
      webAppTags.Html + inputCell(["example input"]) + webAppTags.End
    );

    const processedLine = document.querySelector(
      ".terminalProcLine"
    ) as HTMLElement;
    expect(processedLine.classList.contains("is-complete")).toBe(false);

    shell.displayOutput(inputCell(["pending()"]));
    expect(processedLine.classList.contains("is-complete")).toBe(true);
  });

  it("finishes all buffered input after a delayed parsing error", async () => {
    const { shell, terminal } = await setupShell();
    shell.postMessage("sleep 5");
    shell.postMessage("@");
    shell.postMessage("anything here");

    shell.displayOutput(inputCell(["sleep 5"]));

    const lines = Array.from(
      document.querySelectorAll(".terminalProcLine")
    ) as HTMLElement[];
    expect(lines).toHaveLength(3);
    expect(lines[0].classList.contains("is-complete")).toBe(true);
    expect(lines[1].classList.contains("is-complete")).toBe(false);
    expect(lines[2].classList.contains("is-complete")).toBe(false);

    shell.displayOutput(inputCell(["@"], true));

    expect(lines.every((line) => line.classList.contains("is-complete"))).toBe(
      true
    );
    expect(pressUp(terminal)).toBe("@");
    expect(pressUp(terminal)).toBe("sleep 5");
  });

  it("finishes discarded processed input before the enclosing cell ends", async () => {
    const { shell } = await setupShell();
    shell.postMessage("a=()->(\n\\\nblah\n)");
    const stream = inputCell(["a=()->(", "\\"], true);
    const cellEnd = stream.lastIndexOf(webAppTags.CellEnd);

    shell.displayOutput(stream.slice(0, cellEnd));

    const lines = Array.from(
      document.querySelectorAll(".terminalProcLine")
    ) as HTMLElement[];
    expect(lines).toHaveLength(4);
    expect(lines.every((line) => line.classList.contains("is-complete"))).toBe(
      true
    );

    shell.displayOutput(stream.slice(cellEnd));
    expect(document.querySelectorAll(".M2PastInput")).toHaveLength(1);
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
