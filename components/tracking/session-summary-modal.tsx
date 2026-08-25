import { useMemo } from "react";
import type { SessionSummary } from "@/types/tracking";
import type { CorrectionChoice } from "@/utils/session-correction";
import { useThemeStore } from "@/stores/theme-state";

/**
 * 세션 종료 후 사용자에게 딴짓 시간 처리 선택을 묻는 모달.
 *
 * 실시간 알림은 없다는 원칙(설계 문서 §7)의 결과로 나온 화면 — 세션이 끝나야 처음 알린다.
 * [제외] = 보정된 시간을 서버에 기록. [그대로] = 원본을 기록.
 *
 * 이 모달은 confirmed 세그먼트가 하나라도 있을 때만 뜬다. 딴짓 없는 세션에는 나타나지 않는다.
 */

interface Props {
  summary: SessionSummary;
  onChoose: (choice: CorrectionChoice) => void;
  /** 미매칭 앱 수. 세션 요약 모달 하단에 라벨 설정 안내로 활용. */
  unlabeledCount?: number;
  onGoToLabels?: () => void;
}

const formatSeconds = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  const s = sec % 60;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
};

export default function SessionSummaryModal({
  summary,
  onChoose,
  unlabeledCount = 0,
  onGoToLabels,
}: Props) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  const surface = isDarkMode ? "#1b1e29" : "#ffffff";
  const border = isDarkMode
    ? "1px solid rgba(255,255,255,0.09)"
    : "1px solid rgba(0,0,0,0.08)";
  const textColor = isDarkMode ? "#e8eaf2" : "#1f2430";
  const mutedColor = isDarkMode ? "rgba(232,234,242,0.6)" : "rgba(31,36,48,0.6)";

  const confirmedApps = useMemo(() => {
    const map = new Map<string, number>();
    for (const seg of summary.segments) {
      if (!seg.confirmed) continue;
      map.set(seg.appName, (map.get(seg.appName) ?? 0) + seg.durationSec);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [summary.segments]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="세션 요약"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2147483645,
        color: textColor,
      }}
    >
      <div
        style={{
          width: "min(440px, calc(100vw - 32px))",
          background: surface,
          border,
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "22px 24px 12px" }}>
          <p style={{ margin: 0, fontSize: 13, color: mutedColor }}>
            이번 세션 요약
          </p>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: -0.3,
            }}
          >
            {formatSeconds(summary.rawDurationSec)}
            <span
              style={{
                marginLeft: 10,
                fontSize: 14,
                fontWeight: 500,
                color: "#c46a5f",
              }}
            >
              · 딴짓 {formatSeconds(summary.distractionSec)} 감지
            </span>
          </p>
        </div>

        {confirmedApps.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: "8px 24px 16px",
              borderTop: border,
              fontSize: 13,
              color: mutedColor,
            }}
          >
            {confirmedApps.map(([appName, sec]) => (
              <li
                key={appName}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "3px 0",
                }}
              >
                <span>{appName}</span>
                <span>{formatSeconds(sec)}</span>
              </li>
            ))}
          </ul>
        )}

        <div
          style={{
            padding: "16px 24px 22px",
            borderTop: border,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={() => onChoose("keep")}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: mutedColor,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            그대로 기록
          </button>
          <button
            type="button"
            onClick={() => onChoose("exclude")}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: "#8fb870",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            딴짓 시간 제외
          </button>
        </div>

        {unlabeledCount > 0 && onGoToLabels && (
          <div
            style={{
              padding: "12px 24px",
              borderTop: border,
              fontSize: 12,
              color: mutedColor,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>이 세션에서 라벨링 안된 앱 {unlabeledCount}개</span>
            <button
              type="button"
              onClick={onGoToLabels}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: `1px solid ${mutedColor}`,
                background: "transparent",
                color: mutedColor,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              라벨 설정
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
