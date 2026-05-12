import { describe, expect, it } from "vitest";
import {
  normalizeParsedLocation,
  parsedLocationNeedsCaretMarker,
  parseLocation,
} from "../htmlTools";

describe("parseLocation", () => {
  it("parses a single location without inventing range or focus fields", () => {
    expect(parseLocation("test.m2#1:4")).toEqual([
      "test.m2",
      { start: { row: 1, column: 4 } },
    ]);
  });

  it("parses a range without inventing a focus field", () => {
    expect(parseLocation("test.m2#1:4-2:1")).toEqual([
      "test.m2",
      { start: { row: 1, column: 4 }, end: { row: 2, column: 1 } },
    ]);
  });

  it("parses an explicit focus location", () => {
    expect(parseLocation("test.m2#1:4-2:1_1:5")).toEqual([
      "test.m2",
      {
        start: { row: 1, column: 4 },
        end: { row: 2, column: 1 },
        focus: { row: 1, column: 5 },
      },
    ]);
  });

  it("accepts optional L and C markers", () => {
    expect(parseLocation("test.m2#L1:C4-L2:C1_L1:C5")).toEqual([
      "test.m2",
      {
        start: { row: 1, column: 4 },
        end: { row: 2, column: 1 },
        focus: { row: 1, column: 5 },
      },
    ]);
  });

  it("normalizes missing and out-of-range locations at the consumer boundary", () => {
    expect(
      normalizeParsedLocation({ start: { row: 1, column: 4 } })
    ).toEqual({
      start: { row: 1, column: 4 },
      end: { row: 1, column: 4 },
      focus: { row: 1, column: 4 },
    });
    expect(
      normalizeParsedLocation({
        start: { row: 2, column: 3 },
        end: { row: 4, column: 5 },
        focus: { row: 1, column: 1 },
      })
    ).toEqual({
      start: { row: 2, column: 3 },
      end: { row: 4, column: 5 },
      focus: { row: 2, column: 3 },
    });
    expect(
      normalizeParsedLocation({
        start: { row: 2, column: 3 },
        end: { row: 4, column: 5 },
        focus: { row: 5, column: 1 },
      })
    ).toEqual({
      start: { row: 2, column: 3 },
      end: { row: 4, column: 5 },
      focus: { row: 4, column: 5 },
    });
  });

  it("only requests caret markers for single or focused locations", () => {
    expect(
      parsedLocationNeedsCaretMarker({ start: { row: 1, column: 4 } })
    ).toBe(true);
    expect(
      parsedLocationNeedsCaretMarker({
        start: { row: 1, column: 4 },
        end: { row: 2, column: 1 },
      })
    ).toBe(false);
    expect(
      parsedLocationNeedsCaretMarker({
        start: { row: 1, column: 4 },
        end: { row: 2, column: 1 },
        focus: { row: 1, column: 5 },
      })
    ).toBe(true);
  });

  it("rejects malformed locations", () => {
    expect(parseLocation("test.m2#1:4-2:1_1:5_1:6")).toEqual([
      "test.m2#1:4-2:1_1:5_1:6",
      null,
    ]);
    expect(parseLocation("test.m2#oops")).toEqual(["test.m2#oops", null]);
    expect(parseLocation("test.m2#1:4-")).toEqual(["test.m2#1:4-", null]);
    expect(parseLocation("test.m2#1:4_")).toEqual(["test.m2#1:4_", null]);
  });
});
