import { describe, expect, it } from "vitest";
import { isMacPlatform } from "./platform-shortcut";

describe("platform shortcut label", () => {
  it("recognizes mac from both Electron and navigator values", () => {
    expect(isMacPlatform("darwin")).toBe(true);
    expect(isMacPlatform("MacIntel")).toBe(true);
    expect(isMacPlatform("macOS")).toBe(true);
    expect(isMacPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(true);
  });

  it("treats everything else as a Ctrl platform", () => {
    expect(isMacPlatform("win32")).toBe(false);
    expect(isMacPlatform("Win32")).toBe(false);
    expect(isMacPlatform("linux")).toBe(false);
    expect(isMacPlatform(undefined)).toBe(false);
    expect(isMacPlatform("")).toBe(false);
  });
});
