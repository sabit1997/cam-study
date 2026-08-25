import type { AppPreset } from "@/types/tracking";

/**
 * 앱 라벨 프리셋 — 로컬 저장 + 앱 내장(설계 문서 §2.3).
 *
 * 왜 서버가 아니라 여기에 있는가:
 * - 설치된 앱 목록은 사용자 프라이버시 정보다. 서버에 올릴 이유가 없다.
 * - 흔한 앱 30~40개는 답이 이미 정해져 있어 사용자에게 물을 필요도 없다.
 * - 프리셋에 없는 앱만 LLM(SUGGEST_LABEL, 브랜치 5)이 초안을 제안한다.
 *
 * 브라우저·파인더·CamStudy 자신은 **neutral 고정**. 창 제목 없이는 실제 활동을 알 수 없고,
 * 오탐 무해 원칙(설계 문서 §7)에 따라 모호한 케이스는 학습·딴짓 어느 쪽으로도 몰지 않는다.
 *
 * `id`는 사용자에게 보여주지 않는 안정 키. 나중에 라벨을 옮길 때 이 id로 마이그레이션한다.
 */

export const APP_PRESETS: readonly AppPreset[] = [
  // ── study ─────────────────────────────────────────────────────────────
  { id: "vscode", label: "study", displayName: "VS Code",
    names: { macOS: "Code", windows: "Code.exe" } },
  { id: "cursor", label: "study", displayName: "Cursor",
    names: { macOS: "Cursor", windows: "Cursor.exe" } },
  { id: "zed", label: "study", displayName: "Zed",
    names: { macOS: "Zed", windows: "Zed.exe" } },
  { id: "xcode", label: "study", displayName: "Xcode",
    names: { macOS: "Xcode" } },
  { id: "intellij", label: "study", displayName: "IntelliJ IDEA",
    names: { macOS: "IntelliJ IDEA", windows: "idea64.exe" } },
  { id: "pycharm", label: "study", displayName: "PyCharm",
    names: { macOS: "PyCharm", windows: "pycharm64.exe" } },
  { id: "webstorm", label: "study", displayName: "WebStorm",
    names: { macOS: "WebStorm", windows: "webstorm64.exe" } },
  { id: "iterm2", label: "study", displayName: "iTerm2",
    names: { macOS: "iTerm2" } },
  { id: "warp", label: "study", displayName: "Warp",
    names: { macOS: "Warp", windows: "Warp.exe" } },
  { id: "terminal", label: "study", displayName: "터미널",
    names: { macOS: "Terminal", windows: "WindowsTerminal.exe" } },
  { id: "obsidian", label: "study", displayName: "Obsidian",
    names: { macOS: "Obsidian", windows: "Obsidian.exe" } },
  { id: "notion", label: "study", displayName: "Notion",
    names: { macOS: "Notion", windows: "Notion.exe" } },
  { id: "figma", label: "study", displayName: "Figma",
    names: { macOS: "Figma", windows: "Figma.exe" } },
  { id: "preview", label: "study", displayName: "미리보기 / PDF",
    names: { macOS: "Preview", windows: "SumatraPDF.exe" } },
  { id: "notepad", label: "study", displayName: "메모장",
    names: { macOS: "TextEdit", windows: "Notepad.exe" } },
  { id: "microsoft-word", label: "study", displayName: "Word",
    names: { macOS: "Microsoft Word", windows: "WINWORD.EXE" } },
  { id: "excel", label: "study", displayName: "Excel",
    names: { macOS: "Microsoft Excel", windows: "EXCEL.EXE" } },
  { id: "powerpoint", label: "study", displayName: "PowerPoint",
    names: { macOS: "Microsoft PowerPoint", windows: "POWERPNT.EXE" } },

  // ── distract ──────────────────────────────────────────────────────────
  { id: "kakaotalk", label: "distract", displayName: "카카오톡",
    names: { macOS: "KakaoTalk", windows: "KakaoTalk.exe" } },
  { id: "discord", label: "distract", displayName: "Discord",
    names: { macOS: "Discord", windows: "Discord.exe" } },
  { id: "telegram", label: "distract", displayName: "Telegram",
    names: { macOS: "Telegram", windows: "Telegram.exe" } },
  { id: "line", label: "distract", displayName: "LINE",
    names: { macOS: "LINE", windows: "LINE.exe" } },
  { id: "steam", label: "distract", displayName: "Steam",
    names: { macOS: "Steam", windows: "steam.exe" } },
  { id: "instagram", label: "distract", displayName: "Instagram",
    names: { macOS: "Instagram" } },
  { id: "twitter", label: "distract", displayName: "X (Twitter)",
    names: { macOS: "X", windows: "X.exe" } },
  { id: "netflix", label: "distract", displayName: "Netflix",
    names: { macOS: "Netflix" } },
  { id: "youtube-app", label: "distract", displayName: "YouTube 앱",
    names: { macOS: "YouTube" } },
  { id: "riot", label: "distract", displayName: "Riot / LOL",
    names: { macOS: "League of Legends", windows: "League of Legends.exe" } },

  // ── neutral ───────────────────────────────────────────────────────────
  { id: "camstudy", label: "neutral", displayName: "외요의 캠스터디",
    names: { macOS: "외요의 캠스터디", windows: "외요의 캠스터디.exe" } },
  { id: "chrome", label: "neutral", displayName: "Chrome",
    names: { macOS: "Google Chrome", windows: "chrome.exe" } },
  { id: "safari", label: "neutral", displayName: "Safari",
    names: { macOS: "Safari" } },
  { id: "arc", label: "neutral", displayName: "Arc",
    names: { macOS: "Arc" } },
  { id: "firefox", label: "neutral", displayName: "Firefox",
    names: { macOS: "Firefox", windows: "firefox.exe" } },
  { id: "edge", label: "neutral", displayName: "Edge",
    names: { macOS: "Microsoft Edge", windows: "msedge.exe" } },
  { id: "finder", label: "neutral", displayName: "파인더 / 탐색기",
    names: { macOS: "Finder", windows: "explorer.exe" } },
  { id: "system-settings", label: "neutral", displayName: "시스템 설정",
    names: { macOS: "System Settings", windows: "SystemSettings.exe" } },
  { id: "spotify", label: "neutral", displayName: "Spotify",
    names: { macOS: "Spotify", windows: "Spotify.exe" } },
  { id: "music", label: "neutral", displayName: "Music",
    names: { macOS: "Music" } },
  { id: "zoom", label: "neutral", displayName: "Zoom",
    names: { macOS: "zoom.us", windows: "Zoom.exe" } },
  { id: "slack", label: "neutral", displayName: "Slack",
    names: { macOS: "Slack", windows: "slack.exe" } },
];
