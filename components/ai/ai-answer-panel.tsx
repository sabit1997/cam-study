import type { CSSProperties, ReactNode } from "react";

/**
 * 팔레트 아래에 붙는 인라인 답변 카드.
 *
 * 왜 별도 창을 만들지 않는가:
 * - 조회 결과마다 창 하나를 만들면 팔레트가 창 공장이 된다. 정보를 보러 왔지 창이 필요한 게 아니다.
 * - 팔레트는 이미 승인/거부 판넬 자리가 있다. 그 자리에 답변을 얹는 게 사용자 시선을 옮기지 않는다.
 *
 * 렌더링은 마크다운 파서를 도입하지 않고, 최소한의 인라인 마크업만 처리한다 —
 * **볼드**, 문단 사이 빈 줄, --- 구분선, - 항목. 조회 결과에 필요한 것만 있으면 된다.
 */

interface Props {
  markdown: string;
  onClose: () => void;
  isDarkMode: boolean;
}

const renderInline = (text: string): ReactNode[] => {
  // **bold** 처리만. 링크·이미지·인라인 코드는 필요할 때 추가.
  const parts: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <strong key={key++} style={{ fontWeight: 600 }}>
        {match[1]}
      </strong>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
};

export default function AiAnswerPanel({ markdown, onClose, isDarkMode }: Props) {
  const surface = isDarkMode ? "#1b1e29" : "#ffffff";
  const border = isDarkMode
    ? "1px solid rgba(255,255,255,0.09)"
    : "1px solid rgba(0,0,0,0.08)";
  const textColor = isDarkMode ? "#e8eaf2" : "#1f2430";
  const mutedColor = isDarkMode ? "rgba(232,234,242,0.6)" : "rgba(31,36,48,0.6)";

  const containerStyle: CSSProperties = {
    padding: "16px 20px",
    background: surface,
    borderTop: border,
    color: textColor,
    fontSize: 14,
    lineHeight: 1.55,
  };

  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let bulletBuffer: string[] = [];
  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul
        key={blocks.length}
        style={{
          listStyle: "none",
          margin: "6px 0 8px",
          padding: 0,
        }}
      >
        {bulletBuffer.map((item, i) => (
          <li
            key={i}
            style={{
              padding: "2px 0",
              display: "flex",
              gap: 8,
            }}
          >
            <span aria-hidden="true" style={{ color: mutedColor }}>
              •
            </span>
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      bulletBuffer.push(line.slice(2));
      continue;
    }
    flushBullets();
    if (line === "") {
      // 빈 줄은 문단 사이 간격 정도로만 처리
      continue;
    }
    if (line === "---") {
      blocks.push(
        <hr
          key={blocks.length}
          style={{
            border: "none",
            borderTop: border,
            margin: "10px 0",
          }}
        />
      );
      continue;
    }
    blocks.push(
      <p key={blocks.length} style={{ margin: "4px 0" }}>
        {renderInline(line)}
      </p>
    );
  }
  flushBullets();

  return (
    <div style={containerStyle} aria-live="polite">
      {blocks}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: mutedColor,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
