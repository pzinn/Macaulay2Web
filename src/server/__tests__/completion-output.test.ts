// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { completionProtocol } from "../../common/tags";
import {
  consumeCompletionOutput,
  parseCompletionResponse,
} from "../completionOutput";

const frame = function (id: string, payload: string) {
  return (
    completionProtocol.ResponseStart +
    id +
    "\t" +
    payload +
    completionProtocol.End
  );
};

describe("Macaulay2 completion output", () => {
  it("preserves ordinary output around a completion response", () => {
    const output = vi.fn();
    const response = vi.fn();

    const buffer = consumeCompletionOutput(
      "",
      "before" +
        frame(
          "request-1",
          JSON.stringify([
            "Ring",
            { name: "run", kind: "function" },
            { name: "", kind: "invalid" },
          ])
        ) +
        "after",
      { output, response }
    );

    expect(buffer).toBe("");
    expect(output.mock.calls.map((call) => call[0])).toEqual([
      "before",
      "after",
    ]);
    expect(response).toHaveBeenCalledWith({
      id: "request-1",
      completions: [
        { name: "Ring", kind: "" },
        { name: "run", kind: "function" },
      ],
    });
  });

  it("reassembles a control sequence split across arbitrary chunks", () => {
    const output = vi.fn();
    const response = vi.fn();
    const data =
      "visible" +
      frame("split_2", JSON.stringify([{ name: "matrix", kind: "function" }])) +
      "tail";
    let buffer = "";

    for (const chunk of [
      data.slice(0, 10),
      data.slice(10, 25),
      data.slice(25, 41),
      data.slice(41),
    ])
      buffer = consumeCompletionOutput(buffer, chunk, { output, response });

    expect(buffer).toBe("");
    expect(output.mock.calls.map((call) => call[0]).join("")).toBe(
      "visibletail"
    );
    expect(response).toHaveBeenCalledOnce();
    expect(response.mock.calls[0][0].id).toBe("split_2");
  });

  it("reports malformed JSON without leaking protocol bytes as output", () => {
    const output = vi.fn();
    const response = vi.fn();
    const warn = vi.fn();

    consumeCompletionOutput("", frame("request", "{bad json"), {
      output,
      response,
      warn,
    });

    expect(output).not.toHaveBeenCalled();
    expect(response).toHaveBeenCalledWith({
      id: "request",
      completions: null,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("malformed completion payload")
    );
  });

  it("recovers from an oversized incomplete frame", () => {
    const output = vi.fn();
    const response = vi.fn();
    const warn = vi.fn();

    const buffer = consumeCompletionOutput(
      "",
      completionProtocol.ResponseStart + "broken data that is too long",
      { output, response, warn },
      12
    );

    expect(buffer).toBe("");
    expect(output).toHaveBeenCalledWith("broken data that is too long");
    expect(response).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Dropping oversized incomplete completion frame"
    );
  });

  it("rejects unsafe request identifiers", () => {
    const warn = vi.fn();

    expect(parseCompletionResponse("bad id\t[]", warn)).toBeNull();
    expect(warn).toHaveBeenCalledWith("Dropping malformed completion response");
  });
});
