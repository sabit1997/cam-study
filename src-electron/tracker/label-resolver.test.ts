import { describe, expect, it } from "vitest";
import type { AppPreset } from "../../types/tracking";
import {
  buildLabelIndex,
  resolveLabel,
  toPlatformKey,
} from "./label-resolver";

const PRESETS: AppPreset[] = [
  {
    id: "vscode",
    label: "study",
    names: { macOS: "Code", windows: "Code.exe" },
    displayName: "VS Code",
  },
  {
    id: "kakao",
    label: "distract",
    names: { macOS: "KakaoTalk", windows: "KakaoTalk.exe" },
    displayName: "카카오톡",
  },
  {
    id: "chrome",
    label: "neutral",
    names: { macOS: "Google Chrome", windows: "chrome.exe" },
    displayName: "Chrome",
  },
];

describe("label-resolver", () => {
  const index = buildLabelIndex(PRESETS);

  describe("정확 매칭", () => {
    it("macOS의 Code는 study", () => {
      expect(resolveLabel("Code", "darwin", index)).toBe("study");
    });

    it("Windows의 Code.exe도 study", () => {
      expect(resolveLabel("Code.exe", "win32", index)).toBe("study");
    });
  });

  describe(".exe·대소문자 정규화", () => {
    it(".exe는 대소문자 무시하고 제거된 이름과 매칭", () => {
      expect(resolveLabel("CODE.EXE", "win32", index)).toBe("study");
      expect(resolveLabel("code.exe", "win32", index)).toBe("study");
    });

    it("공백은 트림", () => {
      expect(resolveLabel("  KakaoTalk  ", "darwin", index)).toBe("distract");
    });
  });

  describe("오버라이드 우선순위", () => {
    it("오버라이드가 프리셋을 이긴다", () => {
      const overrides = { Code: "distract" as const };
      expect(resolveLabel("Code", "darwin", index, overrides)).toBe("distract");
    });

    it("오버라이드 키도 정규화되어 비교된다", () => {
      const overrides = { "code.EXE": "distract" as const };
      expect(resolveLabel("Code.exe", "win32", index, overrides)).toBe("distract");
    });

    it("현재 플랫폼과 다른 이름의 오버라이드는 영향 없음", () => {
      // macOS에서 "Code.exe"는 존재하지 않는 앱이지만, 오버라이드 키가 정규화 매칭이므로
      // "Code"로 저장돼 있으면 macOS에서도 잡힌다.
      const overrides = { "Code.exe": "distract" as const };
      expect(resolveLabel("Code", "darwin", index, overrides)).toBe("distract");
    });
  });

  describe("미매칭 앱", () => {
    it("프리셋에 없는 앱은 neutral (오탐 무해 원칙)", () => {
      expect(resolveLabel("SomeUnknownApp", "darwin", index)).toBe("neutral");
    });

    it("빈 문자열도 neutral", () => {
      expect(resolveLabel("", "darwin", index)).toBe("neutral");
    });

    it("리눅스에서 매칭 대상이 없으면 neutral", () => {
      expect(resolveLabel("Code", "linux", index)).toBe("neutral");
    });
  });

  describe("toPlatformKey", () => {
    it("darwin → macOS, win32 → windows, linux → linux", () => {
      expect(toPlatformKey("darwin")).toBe("macOS");
      expect(toPlatformKey("win32")).toBe("windows");
      expect(toPlatformKey("linux")).toBe("linux");
    });

    it("그 밖의 플랫폼은 null", () => {
      expect(toPlatformKey("freebsd")).toBeNull();
      expect(toPlatformKey("aix")).toBeNull();
    });
  });
});
