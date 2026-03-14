import { describe, expect, it } from "vitest";
import { getThemeButtonState } from "../uiHelpers";

describe("getThemeButtonState", () => {
  it("returns day toggle UI when current theme is night", () => {
    expect(getThemeButtonState("night")).toEqual({
      icon: "light_mode",
      title: "Switch to day mode",
    });
  });

  it("returns night toggle UI when current theme is day", () => {
    expect(getThemeButtonState("day")).toEqual({
      icon: "dark_mode",
      title: "Switch to night mode",
    });
  });
});
