import { describe, expect, it } from "vitest";
import { clampWindowPosition, getPositionScale } from "./workspace";

describe("workspace scaling", () => {
  it("fits the full workspace in either viewport dimension", () => {
    expect(getPositionScale(960, 1080)).toBe(0.5);
    expect(getPositionScale(1920, 558)).toBe(0.5);
  });

  it("keeps windows inside the header-free workspace", () => {
    expect(clampWindowPosition(-1, -1, 400, 300, 1920, 1080)).toEqual({
      x: 0,
      y: 0,
    });
    expect(clampWindowPosition(1800, 1000, 400, 300, 1920, 1080)).toEqual({
      x: 1520,
      y: 744,
    });
  });
});
