import { beforeEach, describe, expect, it, vi } from "vitest";

import { autoIndent, delimiterHandling } from "../editor";
import { setCaret } from "../htmlTools";

const setupEditor = function (text: string, caret = text.length) {
  document.body.innerHTML = "";
  const editor = document.createElement("div");
  editor.contentEditable = "true";
  editor.textContent = text;
  document.body.appendChild(editor);
  setCaret(editor, caret);
  delimiterHandling(editor);
  return editor;
};

const markerClasses = function (editor: HTMLElement) {
  return Array.from(editor.querySelectorAll(".marker")).map((marker) => ({
    valid: marker.classList.contains("valid-marker"),
    error: marker.classList.contains("error-marker"),
  }));
};

const installExecCommandMock = function () {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn((command: string, _showUI?: boolean, value?: string) => {
      if (command !== "insertText") return true;
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(value || "");
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }),
  });
  return document.execCommand as any;
};

describe("delimiter handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores delimiters inside strings when matching a closing delimiter", () => {
    const editor = setupEditor('f(")")');

    expect(markerClasses(editor)).toEqual([
      { valid: true, error: false },
      { valid: true, error: false },
    ]);
  });

  it("ignores delimiters inside line comments", () => {
    const editor = setupEditor("f(x -- )\n)");

    expect(markerClasses(editor)).toEqual([
      { valid: true, error: false },
      { valid: true, error: false },
    ]);
  });

  it("ignores delimiters inside block comments", () => {
    const editor = setupEditor("f(x -* ) *-)");

    expect(markerClasses(editor)).toEqual([
      { valid: true, error: false },
      { valid: true, error: false },
    ]);
  });

  it("ignores delimiters inside strings when matching an opening delimiter", () => {
    const editor = setupEditor('(")")', 1);

    expect(markerClasses(editor)).toEqual([
      { valid: true, error: false },
      { valid: true, error: false },
    ]);
  });

  it("matches quote delimiters without treating escaped quotes as delimiters", () => {
    const editor = setupEditor('"a \\" b"');

    expect(markerClasses(editor)).toEqual([
      { valid: true, error: false },
      { valid: true, error: false },
    ]);
  });

  it("ignores quote characters inside comments", () => {
    const editor = setupEditor('-- "not a string"\nf(x)', 20);

    expect(markerClasses(editor)).toEqual([
      { valid: true, error: false },
      { valid: true, error: false },
    ]);
  });

  it("flags mismatched closing delimiters in code", () => {
    const editor = setupEditor("f([)");

    expect(markerClasses(editor)).toEqual([{ valid: false, error: true }]);
  });

  it("autoindents after delimiters in code", () => {
    const execCommand = installExecCommandMock();
    const editor = setupEditor("f(\n");

    autoIndent(editor);

    expect(editor.textContent).toBe("f(\n    ");
    expect(execCommand).toHaveBeenCalledWith("insertText", false, "    ");
  });

  it("does not autoindent after delimiters inside strings", () => {
    const execCommand = installExecCommandMock();
    const editor = setupEditor('print "("\n');

    autoIndent(editor);

    expect(editor.textContent).toBe('print "("\n');
    expect(execCommand).not.toHaveBeenCalledWith(
      "insertText",
      false,
      expect.any(String)
    );
  });

  it("does not autoindent after delimiters inside comments", () => {
    const execCommand = installExecCommandMock();
    const editor = setupEditor("-- (\n");

    autoIndent(editor);

    expect(editor.textContent).toBe("-- (\n");
    expect(execCommand).not.toHaveBeenCalledWith(
      "insertText",
      false,
      expect.any(String)
    );
  });
});
