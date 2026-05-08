import { describe, expect, it } from "vitest";
import { parseLocation } from "../htmlTools";

describe("parseLocation", () => {
  it("parses a single location and uses it as range and focus", () => {
    expect(parseLocation("test.m2#1:4")).toEqual([
      "test.m2",
      [1, 4, 1, 4, 1, 4],
    ]);
  });

  it("parses a range and defaults focus to the start", () => {
    expect(parseLocation("test.m2#1:4-2:1")).toEqual([
      "test.m2",
      [1, 4, 2, 1, 1, 4],
    ]);
  });

  it("parses an explicit focus location", () => {
    expect(parseLocation("test.m2#1:4-2:1_1:5")).toEqual([
      "test.m2",
      [1, 4, 2, 1, 1, 5],
    ]);
  });

  it("accepts optional L and C markers", () => {
    expect(parseLocation("test.m2#L1:C4-L2:C1_L1:C5")).toEqual([
      "test.m2",
      [1, 4, 2, 1, 1, 5],
    ]);
  });

  it("clamps focus to the selected range", () => {
    expect(parseLocation("test.m2#2:3-4:5_1:1")).toEqual([
      "test.m2",
      [2, 3, 4, 5, 2, 3],
    ]);
    expect(parseLocation("test.m2#2:3-4:5_5:1")).toEqual([
      "test.m2",
      [2, 3, 4, 5, 4, 5],
    ]);
  });

  it("rejects malformed locations", () => {
    expect(parseLocation("test.m2#1:4-2:1_1:5_1:6")).toEqual([
      "test.m2#1:4-2:1_1:5_1:6",
      null,
    ]);
    expect(parseLocation("test.m2#oops")).toEqual(["test.m2#oops", null]);
  });
});
