import type { AppLabel, AppPreset } from "../../types/tracking";

/**
 * raw appName → AppLabel 매핑.
 *
 * 우선순위:
 * 1. 사용자 오버라이드 (raw appName 정확 일치, 대소문자 무시)
 * 2. 프리셋의 OS별 이름 일치 (macOS/Windows/Linux)
 * 3. fallback: "neutral"
 *
 * 왜 fallback이 neutral인가:
 * - 오탐 무해 원칙(설계 문서 §7). 모르는 앱을 딴짓으로 몰면 사용자 통계가 부풀려진다.
 * - 프리셋에 없는 앱은 나중에 SUGGEST_LABEL 흐름으로 라벨링 유도(설계 문서 §5, 브랜치 5).
 */

type Platform = "macOS" | "windows" | "linux";

const normalize = (name: string): string => {
  // .exe 확장자와 대소문자를 흡수해 매칭 안정성을 높인다.
  // 프리셋은 원본 표기를 그대로 두되, 조회 시에만 정규화한다.
  const trimmed = name.trim();
  const withoutExe = trimmed.toLowerCase().endsWith(".exe")
    ? trimmed.slice(0, -4)
    : trimmed;
  return withoutExe.toLowerCase();
};

/**
 * NodeJS.Platform에서 우리가 다루는 세 값으로 매핑.
 * 그 밖의 플랫폼은 프리셋 매칭 대상이 아니라 fallback으로 떨어진다.
 */
export const toPlatformKey = (nodePlatform: NodeJS.Platform): Platform | null => {
  if (nodePlatform === "darwin") return "macOS";
  if (nodePlatform === "win32") return "windows";
  if (nodePlatform === "linux") return "linux";
  return null;
};

/**
 * 프리셋 배열로부터 platform 인덱스를 만든다.
 * 조회는 정규화된 이름을 key로 한다.
 */
export interface LabelIndex {
  byPlatform: Map<Platform, Map<string, AppPreset>>;
  presets: readonly AppPreset[];
}

export const buildLabelIndex = (presets: readonly AppPreset[]): LabelIndex => {
  const byPlatform = new Map<Platform, Map<string, AppPreset>>();
  const platforms: Platform[] = ["macOS", "windows", "linux"];

  for (const platform of platforms) {
    byPlatform.set(platform, new Map());
  }

  for (const preset of presets) {
    for (const platform of platforms) {
      const rawName = preset.names[platform];
      if (!rawName) continue;
      byPlatform.get(platform)!.set(normalize(rawName), preset);
    }
  }

  return { byPlatform, presets };
};

/**
 * 오버라이드는 정규화된 raw appName을 키로 저장한다.
 * 사용자가 macOS와 Windows에서 서로 다른 표기의 같은 앱을 라벨링해도 각각 저장된다.
 */
export const resolveLabel = (
  rawAppName: string,
  nodePlatform: NodeJS.Platform,
  index: LabelIndex,
  overrides: Record<string, AppLabel> = {}
): AppLabel => {
  const normalized = normalize(rawAppName);

  // 1. 사용자 오버라이드 — 정규화한 키로 비교.
  const overrideEntries = Object.entries(overrides);
  for (const [key, label] of overrideEntries) {
    if (normalize(key) === normalized) return label;
  }

  // 2. 프리셋의 현재 플랫폼 이름과 일치.
  const platform = toPlatformKey(nodePlatform);
  if (platform) {
    const preset = index.byPlatform.get(platform)?.get(normalized);
    if (preset) return preset.label;
  }

  // 3. fallback neutral.
  return "neutral";
};
