// @vitest-environment node

import { describe, expect, it } from "vitest";

import { webAppTags } from "../../common/tags";
import {
  OutputLimitOptions,
  appendBoundedOutputHistory,
  beginOutputShutdown,
  chargeOutput,
  createOutputProtectionState,
  resetOutputForInput,
  resetOutputForProcess,
} from "../outputProtection";

const limits: OutputLimitOptions = {
  maxOutputBytesPerSecond: 100,
  maxOutputBurstBytes: 1000,
  maxOutputBytesPerInput: 10000,
  outputChunkOverheadBytes: 0,
};

const cell = function (contents: string): string {
  return webAppTags.Cell + contents + webAppTags.CellEnd;
};

describe("Macaulay2 output limiter", () => {
  it("allows a burst up to capacity and rejects output beyond it", () => {
    const state = createOutputProtectionState();

    expect(chargeOutput(state, 800, limits, 0)).toBeNull();
    expect(chargeOutput(state, 201, limits, 0)).toBe("rate");
  });

  it("refills at the configured sustained rate", () => {
    const state = createOutputProtectionState();

    expect(chargeOutput(state, 1000, limits, 0)).toBeNull();
    expect(chargeOutput(state, 100, limits, 1000)).toBeNull();
    expect(chargeOutput(state, 101, limits, 2000)).toBe("rate");
  });

  it("charges fixed overhead for many small chunks", () => {
    const state = createOutputProtectionState();
    const overheadLimits = {
      ...limits,
      maxOutputBurstBytes: 100,
      outputChunkOverheadBytes: 10,
    };

    for (let i = 0; i < 9; i++)
      expect(chargeOutput(state, 1, overheadLimits, 0)).toBeNull();
    expect(chargeOutput(state, 1, overheadLimits, 0)).toBe("rate");
  });

  it("enforces a hard byte ceiling for each input", () => {
    const state = createOutputProtectionState();
    const inputLimits = {
      ...limits,
      maxOutputBurstBytes: 10000,
      maxOutputBytesPerInput: 100,
    };

    expect(chargeOutput(state, 60, inputLimits, 0)).toBeNull();
    expect(chargeOutput(state, 41, inputLimits, 10000)).toBe("input");
  });

  it("resets the input total without refilling rate-limit capacity", () => {
    const state = createOutputProtectionState();
    const smallLimits = { ...limits, maxOutputBurstBytes: 100 };

    expect(chargeOutput(state, 80, smallLimits, 0)).toBeNull();
    resetOutputForInput(state);
    expect(state.bytesThisInput).toBe(0);
    expect(chargeOutput(state, 21, smallLimits, 0)).toBe("rate");
  });

  it("fully resets protection only for a fresh process", () => {
    const state = createOutputProtectionState();
    expect(beginOutputShutdown(state)).toBe(true);
    expect(beginOutputShutdown(state)).toBe(false);

    resetOutputForProcess(state, limits, 500);

    expect(state.blocked).toBe(false);
    expect(state.availableBytes).toBe(limits.maxOutputBurstBytes);
    expect(state.bytesThisInput).toBe(0);
    expect(state.lastRefillTime).toBe(500);
  });
});

describe("bounded terminal output history", () => {
  it("evicts old completed cells while retaining recent output", () => {
    const oldOutput = "old".repeat(20);
    const recentOutput = "recent";
    const history = appendBoundedOutputHistory(
      "",
      cell(oldOutput) + cell(recentOutput),
      24,
      false
    );

    expect(Buffer.byteLength(history.output)).toBeLessThanOrEqual(24);
    expect(history.output).not.toContain(oldOutput);
    expect(history.output).toContain(recentOutput);
    expect(history.dropping).toBe(false);
  });

  it("stops retaining an oversized unterminated cell", () => {
    const history = appendBoundedOutputHistory(
      "",
      webAppTags.Cell + "x".repeat(100),
      32,
      false
    );

    expect(Buffer.byteLength(history.output)).toBeLessThanOrEqual(32);
    expect(history.output).not.toContain("x");
    expect(history.dropping).toBe(true);
  });

  it("resumes retaining output after the dropped cell ends", () => {
    const stillDropping = appendBoundedOutputHistory(
      "ignored",
      "more output",
      32,
      true
    );
    expect(stillDropping.dropping).toBe(true);
    expect(Buffer.byteLength(stillDropping.output)).toBeLessThanOrEqual(32);

    const recovered = appendBoundedOutputHistory(
      stillDropping.output,
      "last ignored bytes" + webAppTags.CellEnd + "new prompt",
      32,
      stillDropping.dropping
    );
    expect(recovered.dropping).toBe(false);
    expect(recovered.output).toContain("new prompt");
    expect(recovered.output).not.toContain("ignored bytes");
    expect(Buffer.byteLength(recovered.output)).toBeLessThanOrEqual(32);
  });

  it("closes an oversized old session before retaining a fresh one", () => {
    const oversized = appendBoundedOutputHistory(
      "",
      webAppTags.Cell + webAppTags.Cell + "x".repeat(100),
      32,
      false
    );
    const closed = appendBoundedOutputHistory(
      oversized.output,
      webAppTags.CellEnd + webAppTags.CellEnd,
      32,
      oversized.dropping
    );
    const fresh = appendBoundedOutputHistory(
      closed.output,
      webAppTags.Cell + webAppTags.Cell + "prompt",
      32,
      closed.dropping
    );

    expect(closed.dropping).toBe(false);
    expect(fresh.output.split(webAppTags.Cell)).toHaveLength(3);
    expect(fresh.output).toContain("prompt");
  });

  it("strictly caps Unicode output by UTF-8 byte length", () => {
    const history = appendBoundedOutputHistory(
      "",
      webAppTags.Cell + "\u03BB".repeat(100),
      17,
      false
    );

    expect(Buffer.byteLength(history.output)).toBeLessThanOrEqual(17);
  });

  it("strictly caps public-session history", () => {
    const history = appendBoundedOutputHistory(
      "",
      "x".repeat(100) + webAppTags.CellEnd + "tail",
      20,
      false,
      true
    );

    expect(Buffer.byteLength(history.output)).toBeLessThanOrEqual(20);
    expect(history.output).toContain("tail");
  });
});
