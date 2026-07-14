import { describe, expect, it } from "vitest";
import { findDirectoryPrefixMatch } from "../uiHelpers";

describe("findDirectoryPrefixMatch", () => {
  const names = ["..", "Alpha.m2", "Beta/", "alpha.m2"];

  it("finds the first case-sensitive prefix match", () => {
    expect(findDirectoryPrefixMatch(names, "Al")).toBe("Alpha.m2");
    expect(findDirectoryPrefixMatch(names, "al")).toBe("alpha.m2");
    expect(findDirectoryPrefixMatch(names, "AL")).toBeNull();
  });

  it("does not match the parent-directory entry or an empty prefix", () => {
    expect(findDirectoryPrefixMatch(names, ".")).toBeNull();
    expect(findDirectoryPrefixMatch(names, "")).toBeNull();
  });
});
