// @vitest-environment node

import { describe, expect, it } from "vitest";

import { describeMathProgramExit } from "../mathProgramExit";

describe("Macaulay2 process exit reporting", () => {
  it("recognizes a clean end command as a normal exit", () => {
    expect(describeMathProgramExit(0, null)).toEqual({
      normal: true,
      detail: "exit code 0",
    });
  });

  it("explains SIGKILL as a probable memory-limit failure", () => {
    expect(describeMathProgramExit(null, "SIGKILL")).toEqual({
      normal: false,
      detail: "signal SIGKILL",
      userMessage:
        "Macaulay2 was killed, probably because it exceeded the memory limit. Press Reset to start a fresh process.",
    });
  });

  it("reports other signals and nonzero exit codes distinctly", () => {
    expect(describeMathProgramExit(null, "SIGSEGV")).toEqual({
      normal: false,
      detail: "signal SIGSEGV",
      userMessage:
        "Macaulay2 exited unexpectedly with signal SIGSEGV. Press Reset to start a fresh process.",
    });
    expect(describeMathProgramExit(2, null)).toEqual({
      normal: false,
      detail: "exit code 2",
      userMessage:
        "Macaulay2 exited unexpectedly with exit code 2. Press Reset to start a fresh process.",
    });
  });

  it("has a fallback when SSH supplies neither code nor signal", () => {
    expect(describeMathProgramExit(null, null)).toEqual({
      normal: false,
      detail: "unknown exit status",
      userMessage:
        "Macaulay2 exited unexpectedly. Press Reset to start a fresh process.",
    });
  });
});
