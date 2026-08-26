/**
 * OS별 단축키 표기.
 *
 * 팔레트 자체는 metaKey/ctrlKey를 모두 받으므로(hooks/useCommandPalette.ts) 동작에는
 * 차이가 없지만, 안내 문구까지 "Cmd+K"로 고정하면 윈도우 사용자는 자기 키보드에
 * 없는 키를 찾게 된다. 그래서 표기만 플랫폼에 맞춰 바꾼다.
 *
 * 판별 우선순위: Electron이 알려주는 process.platform → navigator. 데스크탑에서는
 * 앞의 값이 항상 정확하고, 웹에서는 navigator만 남는다.
 */

/** "darwin"(Electron) / "MacIntel"·"macOS"(navigator) 같은 값을 모두 받아 mac 여부를 낸다. */
export function isMacPlatform(platform: string | undefined | null): boolean {
  if (!platform) return false;
  const value = platform.toLowerCase();
  return value.includes("mac") || value === "darwin";
}

/** 현재 환경의 수식 키 이름 — "Cmd" 또는 "Ctrl". */
export function modifierKeyLabel(): string {
  if (typeof window === "undefined") return "Ctrl";

  const electronPlatform = window.electronAPI?.platform;
  if (electronPlatform) return isMacPlatform(electronPlatform) ? "Cmd" : "Ctrl";

  const nav = window.navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const uaPlatform = nav?.userAgentData?.platform ?? nav?.platform ?? nav?.userAgent;
  return isMacPlatform(uaPlatform) ? "Cmd" : "Ctrl";
}

/** 명령 팔레트를 여는 단축키 표기 — "Cmd+K" 또는 "Ctrl+K". */
export function commandPaletteShortcut(): string {
  return `${modifierKeyLabel()}+K`;
}
