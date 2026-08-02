import { describe, expect, it } from "vitest";
import { adjustBlurAmount, getBlurAmountDelta } from "./blur-controls";

describe("blur keyboard controls", () => {
  it("maps all arrow keys to blur adjustments", () => {
    expect(getBlurAmountDelta("ArrowUp")).toBe(1);
    expect(getBlurAmountDelta("ArrowRight")).toBe(1);
    expect(getBlurAmountDelta("ArrowDown")).toBe(-1);
    expect(getBlurAmountDelta("ArrowLeft")).toBe(-1);
  });

  it("keeps blur strength in its allowed range", () => {
    expect(adjustBlurAmount(20, 1)).toBe(20);
    expect(adjustBlurAmount(1, -1)).toBe(1);
  });
});
