import { useEffect } from "react";

/**
 * 유튜브 검색 취향 질문 UI.
 *
 * LLM(SEARCH_YOUTUBE.clarify)이 "어떤 ASMR이 좋으세요?" 같은 질문과 옵션 2~4개를
 * 준비해서 오면 이 패널이 칩으로 그린다. 사용자가 하나 고르면 그 옵션의 query로
 * 파이프라인을 재호출한다 — 추가 LLM 호출 없이 검색만 다시 태운다.
 *
 * 왜 대화가 아니라 칩인가:
 * - 팔레트는 짧게 끝나야 흐름을 방해하지 않는다. 한 턴이면 충분한 정보를 미리 뽑아둔다.
 * - 옵션은 LLM이 만들어 붙였으므로 사용자는 타이핑 없이 클릭 한 번으로 넘어간다.
 * - "상관없음"과 "직접 입력"이 백업이라 옵션이 취향에 안 맞아도 막다른 길이 아니다.
 */

export interface ClarifyOption {
  label: string;
  query: string;
}

interface Props {
  question: string;
  options: ClarifyOption[];
  /** "상관없음" 선택 시 이 검색어로 검색. LLM이 준 SEARCH_YOUTUBE.query 원본. */
  baseQuery: string;
  onPick: (query: string) => void;
  /** "직접 입력" — 팔레트 입력창으로 돌아가 사용자가 새 문장을 치도록 한다. */
  onEditQuery: () => void;
  onCancel: () => void;
  isDarkMode: boolean;
}

export default function YoutubeClarifyPanel({
  question,
  options,
  baseQuery,
  onPick,
  onEditQuery,
  onCancel,
  isDarkMode,
}: Props) {
  const surface = isDarkMode ? "#1b1e29" : "#ffffff";
  const border = isDarkMode
    ? "1px solid rgba(255,255,255,0.09)"
    : "1px solid rgba(0,0,0,0.08)";
  const textColor = isDarkMode ? "#e8eaf2" : "#1f2430";
  const mutedColor = isDarkMode ? "rgba(232,234,242,0.6)" : "rgba(31,36,48,0.6)";
  const chipBg = isDarkMode ? "rgba(143,184,112,0.14)" : "rgba(143,184,112,0.12)";
  const chipBorder = isDarkMode
    ? "1px solid rgba(143,184,112,0.35)"
    : "1px solid rgba(143,184,112,0.4)";

  // 숫자키(1~9)로 옵션을 즉시 고른다. 팔레트의 입력창은 리셋된 상태라 텍스트 입력과 겹치지 않는다.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const n = parseInt(event.key, 10);
      if (Number.isNaN(n) || n < 1 || n > options.length) return;
      event.preventDefault();
      onPick(options[n - 1].query);
    };
    globalThis.window.addEventListener("keydown", handler);
    return () => globalThis.window.removeEventListener("keydown", handler);
  }, [options, onPick]);

  return (
    <div
      style={{
        padding: "16px 20px",
        borderTop: border,
        background: surface,
        color: textColor,
      }}
    >
      <p style={{ margin: "0 0 12px", fontSize: 14 }}>{question}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {options.map((opt, i) => (
          <button
            key={`${opt.label}-${i}`}
            type="button"
            onClick={() => onPick(opt.query)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: chipBorder,
              background: chipBg,
              color: textColor,
              fontSize: 13,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                fontSize: 10,
                color: mutedColor,
                minWidth: 12,
                textAlign: "center",
              }}
            >
              {i + 1}
            </span>
            {opt.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: mutedColor,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          취소
        </button>
        <button
          type="button"
          onClick={onEditQuery}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: chipBorder,
            background: "transparent",
            color: textColor,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          직접 입력
        </button>
        <button
          type="button"
          onClick={() => onPick(baseQuery)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: "#8fb870",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          상관없음
        </button>
      </div>
    </div>
  );
}
