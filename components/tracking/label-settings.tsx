import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AppLabel, AppPreset } from "@/types/tracking";
import { APP_LABELS } from "@/types/tracking";
import { useThemeStore } from "@/stores/theme-state";

/**
 * 앱 라벨 설정 화면.
 *
 * 왜 여기가 유일한 진입점인가:
 * - 첫 실행 온보딩에 라벨을 묻지 않는다는 결정(설계 문서 §2.3). 프리셋으로 흔한 앱은 답이 정해져 있고,
 *   프리셋에 없는 앱은 나중에 SUGGEST_LABEL 흐름으로만 노출된다.
 * - 여기서만 사용자가 라벨을 뒤집을 수 있다. 오버라이드는 로컬(electron-store)에만 저장된다.
 *
 * 데스크탑 전용: `window.electronAPI?.tracker`가 없으면 안내 메시지만 보인다.
 */

const LABEL_KOREAN: Record<AppLabel, string> = {
  study: "학습",
  distract: "딴짓",
  neutral: "중립",
};

const LABEL_COLOR: Record<AppLabel, string> = {
  study: "#8fb870",
  distract: "#c46a5f",
  neutral: "#9099a8",
};

const LABEL_ORDER: AppLabel[] = ["study", "distract", "neutral"];

interface LoadedState {
  presets: AppPreset[];
  overrides: Record<string, AppLabel>;
}

export default function LabelSettings() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const [state, setState] = useState<LoadedState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!window.electronAPI?.tracker) {
      setLoading(false);
      return;
    }
    void window.electronAPI.tracker
      .getLabels()
      .then((result) => setState({ presets: result.presets, overrides: result.overrides }))
      .catch((error) => {
        console.error("[label-settings] getLabels 실패:", error);
        toast.error("라벨 목록을 불러오지 못했어요.");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChangeLabel = useCallback(
    async (preset: AppPreset, label: AppLabel) => {
      if (!window.electronAPI?.tracker) return;
      // 오버라이드 키는 프리셋의 현재 플랫폼 이름을 쓴다.
      // (macOS와 Windows에서 이름이 다르면 각각 오버라이드가 필요하다는 의도된 트레이드오프)
      const platformName =
        (typeof window !== "undefined" && window.electronAPI?.platform === "win32"
          ? preset.names.windows
          : preset.names.macOS) ?? preset.names.linux;
      if (!platformName) return;

      try {
        if (label === preset.label) {
          // 프리셋 기본값으로 되돌리기 = 오버라이드 삭제
          await window.electronAPI.tracker.removeLabel(platformName);
          setState((prev) =>
            prev
              ? {
                  ...prev,
                  overrides: Object.fromEntries(
                    Object.entries(prev.overrides).filter(([k]) => k !== platformName)
                  ),
                }
              : prev
          );
        } else {
          await window.electronAPI.tracker.setLabel(platformName, label);
          setState((prev) =>
            prev
              ? { ...prev, overrides: { ...prev.overrides, [platformName]: label } }
              : prev
          );
        }
      } catch (error) {
        console.error("[label-settings] setLabel 실패:", error);
        toast.error("라벨 저장에 실패했어요.");
      }
    },
    []
  );

  const grouped = useMemo(() => {
    if (!state) return null;
    const byLabel: Record<AppLabel, Array<{ preset: AppPreset; effective: AppLabel }>> = {
      study: [],
      distract: [],
      neutral: [],
    };
    for (const preset of state.presets) {
      const platformName =
        (typeof window !== "undefined" && window.electronAPI?.platform === "win32"
          ? preset.names.windows
          : preset.names.macOS) ?? preset.names.linux;
      const overridden = platformName ? state.overrides[platformName] : undefined;
      const effective = overridden ?? preset.label;
      byLabel[effective].push({ preset, effective });
    }
    for (const label of APP_LABELS) {
      byLabel[label].sort((a, b) => a.preset.displayName.localeCompare(b.preset.displayName));
    }
    return byLabel;
  }, [state]);

  const textPrimary = isDarkMode ? "#e5e7eb" : "#1f2430";
  const textMuted = isDarkMode ? "rgba(232,234,242,0.6)" : "rgba(31,36,48,0.6)";
  const surface = isDarkMode ? "rgba(22,24,34,0.88)" : "rgba(255,255,255,0.9)";
  const border = isDarkMode
    ? "1px solid rgba(255,255,255,0.09)"
    : "1px solid rgba(0,0,0,0.06)";

  if (!window.electronAPI?.tracker) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: textMuted }}>
        <p>딴짓 감지는 데스크탑 앱에서만 동작해요.</p>
        <p style={{ marginTop: 8, fontSize: 13 }}>
          <a href="/download" style={{ color: "#8fb870", textDecoration: "underline" }}>
            데스크탑 앱 다운로드
          </a>
        </p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: textMuted }}>불러오는 중…</div>;
  }

  if (!grouped) {
    return <div style={{ padding: 40, textAlign: "center", color: textMuted }}>라벨 목록을 표시할 수 없어요.</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto", color: textPrimary }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 6px" }}>앱 라벨 설정</h1>
      <p style={{ fontSize: 13, color: textMuted, margin: "0 0 20px" }}>
        여기서 바꾼 라벨은 이 기기에만 저장됩니다. 서버로 앱 목록을 보내지 않습니다.
      </p>

      {LABEL_ORDER.map((label) => (
        <section key={label} style={{ marginBottom: 20 }}>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 600,
              margin: "0 0 8px",
              color: LABEL_COLOR[label],
            }}
          >
            {LABEL_KOREAN[label]} ({grouped[label].length})
          </h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, background: surface, borderRadius: 10, border, overflow: "hidden" }}>
            {grouped[label].length === 0 && (
              <li style={{ padding: "12px 16px", fontSize: 13, color: textMuted }}>
                아직 이 라벨에 속한 앱이 없어요.
              </li>
            )}
            {grouped[label].map(({ preset, effective }) => (
              <li
                key={preset.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 16px",
                  borderBottom: border,
                  fontSize: 14,
                }}
              >
                <div>
                  <span>{preset.displayName}</span>
                  {effective !== preset.label && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: textMuted,
                      }}
                    >
                      · 기본: {LABEL_KOREAN[preset.label]}
                    </span>
                  )}
                </div>
                <select
                  value={effective}
                  onChange={(e) => handleChangeLabel(preset, e.target.value as AppLabel)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border,
                    background: "transparent",
                    color: textPrimary,
                    fontSize: 13,
                  }}
                  aria-label={`${preset.displayName} 라벨`}
                >
                  {LABEL_ORDER.map((l) => (
                    <option key={l} value={l}>
                      {LABEL_KOREAN[l]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
