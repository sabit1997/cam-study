import { useState } from "react";
import type { FilteredCandidate } from "@/utils/youtube-pipeline";

/**
 * 유튜브 검색 결과 승인 UI.
 *
 * 승인 대상은 최종 재생목록에 담을 영상뿐이다. 검색·임베드 검사는 이미 통과한 상태로
 * 여기 온다(utils/youtube-pipeline.ts). 사용자는 원하는 영상만 체크해서 실행한다.
 *
 * 썸네일은 i.ytimg.com 도메인만 사용. LLM이 지어낸 이미지 URL이 여기 들어올 수 없다.
 */

interface Props {
  candidates: FilteredCandidate[];
  onApprove: (selected: FilteredCandidate[]) => void;
  onCancel: () => void;
  isDarkMode: boolean;
}

export default function YoutubeApprovalPanel({
  candidates,
  onApprove,
  onCancel,
  isDarkMode,
}: Props) {
  // 초기값: 전부 체크. 사용자가 명시적으로 뺄 게 없다면 그대로 실행되게 한다.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((c) => c.videoId))
  );

  const surface = isDarkMode ? "#1b1e29" : "#ffffff";
  const border = isDarkMode
    ? "1px solid rgba(255,255,255,0.09)"
    : "1px solid rgba(0,0,0,0.08)";
  const textColor = isDarkMode ? "#e8eaf2" : "#1f2430";
  const mutedColor = isDarkMode ? "rgba(232,234,242,0.6)" : "rgba(31,36,48,0.6)";

  const toggle = (videoId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const handleApprove = () => {
    onApprove(candidates.filter((c) => selected.has(c.videoId)));
  };

  if (candidates.length === 0) {
    return (
      <div style={{ padding: "16px 20px", borderTop: border, color: mutedColor }}>
        임베드 가능한 영상을 찾지 못했어요. 다른 검색어로 시도해 보세요.
        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
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
            닫기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "16px 20px",
        borderTop: border,
        background: surface,
        color: textColor,
      }}
    >
      <p style={{ margin: "0 0 10px", fontSize: 13, color: mutedColor }}>
        재생목록에 담을 영상을 골라주세요 ({selected.size}개 선택)
      </p>
      <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0 }}>
        {candidates.map((c) => {
          const checked = selected.has(c.videoId);
          return (
            <li key={c.videoId} style={{ margin: "0 0 8px" }}>
              <label
                style={{
                  display: "flex",
                  gap: 10,
                  padding: 8,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: checked
                    ? isDarkMode
                      ? "rgba(143,184,112,0.14)"
                      : "rgba(143,184,112,0.12)"
                    : "transparent",
                  alignItems: "center",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c.videoId)}
                  aria-label={c.title}
                />
                <img
                  src={`https://i.ytimg.com/vi/${c.videoId}/mqdefault.jpg`}
                  alt=""
                  width={80}
                  height={45}
                  style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.title}
                  </div>
                  {c.channel && (
                    <div
                      style={{
                        fontSize: 12,
                        color: mutedColor,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.channel}
                    </div>
                  )}
                </div>
              </label>
            </li>
          );
        })}
      </ul>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: mutedColor,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={selected.size === 0}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            border: "none",
            background: "#8fb870",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: selected.size === 0 ? "not-allowed" : "pointer",
            opacity: selected.size === 0 ? 0.5 : 1,
          }}
        >
          재생목록에 담기
        </button>
      </div>
    </div>
  );
}
