import { describe, expect, it } from "vitest";
import { APP_LABELS } from "@/types/tracking";
import { APP_PRESETS } from "./app-presets";

describe("app-presets", () => {
  it("id는 유일하다", () => {
    const ids = APP_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("label은 정의된 세 값 중 하나다", () => {
    const allowed = new Set<string>(APP_LABELS);
    for (const preset of APP_PRESETS) {
      expect(allowed.has(preset.label)).toBe(true);
    }
  });

  it("displayName은 비어 있지 않다", () => {
    for (const preset of APP_PRESETS) {
      expect(preset.displayName.trim().length).toBeGreaterThan(0);
    }
  });

  it("각 프리셋은 macOS 또는 windows 이름이 하나 이상 있다", () => {
    for (const preset of APP_PRESETS) {
      const hasName = Boolean(preset.names.macOS || preset.names.windows || preset.names.linux);
      expect(hasName).toBe(true);
    }
  });

  it("CamStudy 자신은 neutral (설계 문서 §2.2)", () => {
    const camstudy = APP_PRESETS.find((p) => p.id === "camstudy");
    expect(camstudy).toBeDefined();
    expect(camstudy?.label).toBe("neutral");
  });

  it("브라우저는 전부 neutral (창 제목 없이 실제 활동을 판단할 수 없다)", () => {
    const browsers = ["chrome", "safari", "arc", "firefox", "edge"];
    for (const id of browsers) {
      const preset = APP_PRESETS.find((p) => p.id === id);
      expect(preset?.label).toBe("neutral");
    }
  });

  it("카톡·디스코드는 distract로 라벨된다 (설계 문서 §1의 데이터 근거)", () => {
    expect(APP_PRESETS.find((p) => p.id === "kakaotalk")?.label).toBe("distract");
    expect(APP_PRESETS.find((p) => p.id === "discord")?.label).toBe("distract");
  });

  it("VSCode·터미널은 study", () => {
    expect(APP_PRESETS.find((p) => p.id === "vscode")?.label).toBe("study");
    expect(APP_PRESETS.find((p) => p.id === "terminal")?.label).toBe("study");
  });
});
