import { describe, expect, it } from "vitest";
import { computeResizeFlexBasis } from "../uiHelpers";

describe("computeResizeFlexBasis", () => {
  it("uses pointer delta so there is no initial jump", () => {
    expect(computeResizeFlexBasis(500, 300, 300)).toBe("500px");
    expect(computeResizeFlexBasis(500, 300, 320)).toBe("520px");
    expect(computeResizeFlexBasis(500, 300, 260)).toBe("460px");
  });
});
