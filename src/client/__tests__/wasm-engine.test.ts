import { describe, expect, it } from "vitest";
import { webAppTags as t } from "../../common/tags";
import { wasmSocket } from "../wasmEngine";

// upstream Macaulay2 output -> the dialect expected by the client
const translator = () => {
  const socket = wasmSocket("test") as any;
  return (chunk: string) => socket.translate(chunk);
};
const prompt = (n: number) =>
  t.CellEnd + t.Cell + t.Prompt + "i" + n + t.End + " : " + t.Input;
const position = (row: number) => t.Position + row + ":0" + t.End;

describe("wasm engine output translation", () => {
  it("ends echoed input lines with InputEnd, across chunks", () => {
    const translate = translator();
    expect(translate(prompt(1) + position(1))).toBe(prompt(1) + position(1));
    expect(translate("x = (\n")).toBe("x = (\n" + t.InputEnd);
    expect(translate(t.InputContd + position(2) + "1)\n\n" + t.Prompt)).toBe(
      t.InputContd + position(2) + "1)\n" + t.InputEnd + "\n" + t.Prompt
    );
  });

  it("marks input discarded after a parsing error (repeated prompt)", () => {
    const translate = translator();
    translate(prompt(1) + position(1));
    const out = translate("1+)\nstdio:1:2: error: syntax error\n" + prompt(1));
    expect(out).toBe(
      "1+)\n" +
        t.InputEnd +
        "stdio:1:2: error: syntax error\n" +
        t.InputDiscarded +
        prompt(1)
    );
    expect(translate("2\n\n" + prompt(2))).not.toContain(t.InputDiscarded);
  });

  it("holds back a prompt split across chunks", () => {
    const translate = translator();
    translate(prompt(1) + position(1) + "1+)\n");
    expect(translate("error\n" + t.CellEnd + t.Cell)).toBe("error\n");
    expect(translate(t.Prompt + "i1" + t.End + " : ")).toBe(
      t.InputDiscarded + t.CellEnd + t.Cell + t.Prompt + "i1" + t.End + " : "
    );
  });

  it("wraps replies to read() as input", () => {
    const socket = wasmSocket("test") as any;
    socket.translate(prompt(1) + position(1) + 'read "n? "\n' + "n? ");
    socket.readReply = !socket.inInput; // what flush() does when sending input
    expect(socket.translate("3\n")).toBe(t.Input + "3\n" + t.InputEnd);
  });
});
