import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useThemeStore } from "@/stores/theme-state";
import useCommandPalette from "@/hooks/useCommandPalette";
import { useInterpretCommand } from "@/apis/services/ai-services/mutation";
import { validateAiActions } from "@/utils/ai-action-validate";
import { describeAiActions } from "@/utils/ai-action-describe";
import { filterSuggestions } from "@/utils/command-suggestions";
import { apiErrorMessage } from "@/utils/api-error";
import { consume as consumeQuota, getRemaining as getQuotaRemaining } from "@/utils/ai-quota";
import { getFallbackActions } from "@/utils/ai-fallback";
import {
  searchAndFilter,
  toPlayActions,
  type FilteredCandidate,
} from "@/utils/youtube-pipeline";
import { runAiActions } from "./ai-action-runner";
import YoutubeApprovalPanel from "./youtube-approval-panel";
import type { AiAction } from "@/types/ai-actions";

/**
 * Cmd+K 명령 팔레트.
 *
 * 입력 → 해석 → 검증 → 승인 → 실행. AI가 만든 액션은 사용자가 무엇이 바뀌는지 읽고
 * 승인하기 전까지 아무 일도 일으키지 않는다.
 *
 * 접근성: W3C combobox 패턴을 따른다. 화살표 키는 실제 포커스를 옮기지 않고
 * aria-activedescendant로 활성 항목만 가리킨다. 포커스가 입력창을 떠나면 계속 타이핑할 수 없고
 * 스크린 리더도 혼란스러워지기 때문이다.
 */

const ACCENT = "#8fb870";
const LISTBOX_ID = "command-palette-suggestions";
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [href]";

type Phase =
  | { status: "input" }
  | { status: "interpreting" }
  | { status: "review"; actions: AiAction[]; source?: "server" | "fallback" }
  | { status: "rejected"; reasons: string[] }
  | { status: "running" }
  | { status: "searching-youtube" }
  | { status: "youtube-review"; candidates: FilteredCandidate[] };

/**
 * 팔레트가 검색 흐름으로 라우팅할 문장을 감지한다.
 *
 * 왜 서버(LLM)에 맡기지 않는가:
 * - LLM에게 "이건 검색이야 아니면 명령이야"를 물으면 두 번 호출이 되고 quota를 두 배로 태운다.
 * - 짧은 키워드 매칭이 발표 데모의 대표 문장 "강의 3개 찾아서 담아줘"를 안정적으로 잡는다.
 * - 매칭 실패 시 자연스럽게 기존 ai-interpret 경로로 흘러가므로 다른 명령은 영향받지 않는다.
 */
const YOUTUBE_SEARCH_RE = /(유튜브|영상|강의)[^]*?(찾아|검색|추천|담아|틀어)/;

/** 문장에서 "숫자 개" 표현을 뽑아 검색할 후보 수로 삼는다. 못 찾으면 3개. */
const extractCount = (text: string): number => {
  const match = text.match(/(\d+)\s*개/);
  if (!match) return 3;
  const n = parseInt(match[1], 10);
  return Math.max(1, Math.min(8, n));
};

export default function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const { mutateAsync: interpretCommand } = useInterpretCommand();

  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>({ status: "input" });
  const [activeIndex, setActiveIndex] = useState(0);
  const [quotaRemaining, setQuotaRemaining] = useState<number>(() =>
    getQuotaRemaining()
  );

  // 팔레트를 열 때 localStorage에서 남은 몫을 다시 읽는다.
  // 사용자가 다른 탭·데스크탑에서 소비했을 수 있고, 자정이 지났을 수도 있다.
  useEffect(() => {
    if (isOpen) setQuotaRemaining(getQuotaRemaining());
  }, [isOpen]);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  /**
   * 해석·실행 요청의 세대 번호.
   *
   * 팔레트를 닫거나 새 명령을 시작하면 올라간다. 진행 중이던 응답이 뒤늦게 도착했을 때
   * 자기 세대가 아니면 상태를 건드리지 않는다. 이게 없으면 "해석 중"에 Escape로 닫은
   * 명령의 결과가 나중에 review 화면으로 살아나, 다음에 열었을 때 Enter 한 번으로 실행된다.
   */
  const requestId = useRef(0);
  /** 팔레트를 열기 직전에 포커스가 있던 곳 — 닫을 때 여기로 돌려준다 */
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const suggestions = useMemo(
    () => (phase.status === "input" ? filterSuggestions(query) : []),
    [phase.status, query]
  );

  // 리셋은 아래 useEffect가 isOpen을 보고 한다. 여기서 또 하지 않는다.
  const handleClose = useCallback(() => close(), [close]);

  /**
   * 닫히면 무조건 초기 상태로 돌아간다.
   *
   * 닫는 경로가 네 개(Escape, 바깥 클릭, 무시 버튼, Cmd+K 토글)인데 그중 하나만
   * 리셋을 빼먹어도 승인 대기 중인 액션이 살아남는다. 그래서 개별 경로가 아니라
   * isOpen에 리셋을 매달았다 — 경로가 더 늘어도 여기 한 곳이 덮는다.
   */
  useEffect(() => {
    if (isOpen) return;
    requestId.current += 1; // 진행 중인 응답 무효화
    setQuery("");
    setPhase({ status: "input" });
    setActiveIndex(0);
  }, [isOpen]);

  // 열릴 때 입력창으로, 닫힐 때 원래 있던 곳으로 포커스를 돌려준다.
  // 닫았는데 포커스가 페이지 맨 위로 가버리면 키보드 사용자는 처음부터 다시 탐색해야 한다.
  useEffect(() => {
    if (isOpen) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      inputRef.current?.focus();
      return;
    }
    previouslyFocused.current?.focus?.();
    previouslyFocused.current = null;
  }, [isOpen]);

  /**
   * 이미 fallback 액션이 준비돼 있으면 검증을 태워 review로 넘긴다.
   * 서버 응답과 fallback을 같은 경로로 태워 미리보기·승인·실행이 어긋나지 않게 한다.
   */
  const showFallback = useCallback(
    (generation: number, actions: AiAction[]) => {
      if (generation !== requestId.current) return;
      const validation = validateAiActions(actions);
      if (!validation.ok || validation.actions.length === 0) {
        setPhase({
          status: "rejected",
          reasons: ["오프라인 데모 응답이 준비되어 있지 않아요."],
        });
        return;
      }
      setPhase({
        status: "review",
        actions: validation.actions,
        source: "fallback",
      });
    },
    []
  );

  const runYoutubeFlow = useCallback(
    async (generation: number, query: string) => {
      // 유튜브 검색은 quota를 두 배로 먹는다(youtube-search purpose).
      const reservation = consumeQuota("youtube-search");
      setQuotaRemaining(reservation.remaining);
      if (!reservation.ok) {
        setPhase({
          status: "rejected",
          reasons: ["오늘의 AI 호출 몫을 다 썼어요. 자정에 다시 채워집니다."],
        });
        return;
      }
      setPhase({ status: "searching-youtube" });
      try {
        const count = extractCount(query);
        const candidates = await searchAndFilter(query, count);
        if (generation !== requestId.current) return;
        setPhase({ status: "youtube-review", candidates });
      } catch (error) {
        if (generation !== requestId.current) return;
        setPhase({
          status: "rejected",
          reasons: [apiErrorMessage(error, "유튜브 검색에 실패했어요.")],
        });
      }
    },
    []
  );

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const generation = ++requestId.current;

      // 유튜브 검색 흐름은 별도 경로 — 승인 UI가 다르고 quota 가중치도 다르다.
      if (YOUTUBE_SEARCH_RE.test(trimmed)) {
        void runYoutubeFlow(generation, trimmed);
        return;
      }

      // 요청을 보내기 전에 남은 몫을 먼저 예약한다. 부족하면 서버까지 가지 않는다.
      // 서버 IP 레이트리밋은 실질 방어선으로 남기고, 사용자에게는 이 층에서 사전 안내를 준다.
      const reservation = consumeQuota("command");
      setQuotaRemaining(reservation.remaining);
      if (!reservation.ok) {
        // 예산이 소진돼도 예시 문장이라면 오프라인 데모 응답으로 살려낸다.
        // 데모의 얼굴이 되는 다섯 개는 429에서도 동작해야 한다.
        const fallback = getFallbackActions(trimmed);
        if (fallback) {
          showFallback(generation, fallback);
          return;
        }
        setPhase({
          status: "rejected",
          reasons: [
            "오늘의 AI 호출 몫을 다 썼어요. 자정에 다시 채워집니다.",
          ],
        });
        return;
      }

      setPhase({ status: "interpreting" });
      try {
        const { actions } = await interpretCommand(trimmed);
        // 닫혔거나 다른 명령이 시작됐으면 이 응답은 버린다
        if (generation !== requestId.current) return;

        // 서버가 준 액션도 실행 전에 다시 검증한다.
        // 미리보기에 보여주는 것과 실제로 실행되는 것이 어긋나면 승인이 의미를 잃는다.
        const validation = validateAiActions(actions);
        if (!validation.ok) {
          setPhase({ status: "rejected", reasons: validation.reasons });
          return;
        }
        if (validation.actions.length === 0) {
          setPhase({
            status: "rejected",
            reasons: ["무엇을 하라는 건지 이해하지 못했어요. 다르게 말해보시겠어요?"],
          });
          return;
        }
        setPhase({ status: "review", actions: validation.actions, source: "server" });
      } catch (error) {
        if (generation !== requestId.current) return;
        // 429(서버 레이트리밋)에 걸렸어도 예시 문장이면 fallback으로 넘긴다.
        // apis/request.ts는 { response: { status } } 평면 객체로 reject한다.
        const status =
          typeof error === "object" && error !== null && "response" in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 429) {
          const fallback = getFallbackActions(trimmed);
          if (fallback) {
            showFallback(generation, fallback);
            return;
          }
        }
        // apis/request.ts는 Error가 아닌 평면 객체를 reject한다.
        // instanceof Error로 분기하면 서버가 만든 429·503 안내가 전부 버려진다.
        setPhase({
          status: "rejected",
          reasons: [apiErrorMessage(error, "명령을 해석하지 못했습니다.")],
        });
      }
    },
    [interpretCommand, showFallback, runYoutubeFlow]
  );

  const approveYoutube = useCallback(
    async (selected: FilteredCandidate[]) => {
      if (selected.length === 0) {
        handleClose();
        return;
      }
      const generation = ++requestId.current;
      setPhase({ status: "running" });
      const actions = toPlayActions(selected);
      const result = await runAiActions(actions);
      if (generation !== requestId.current) return;
      if (result.ok) {
        handleClose();
        return;
      }
      setPhase({ status: "rejected", reasons: result.reasons ?? [result.summary] });
    },
    [handleClose]
  );

  const confirm = useCallback(async () => {
    if (phase.status !== "review") return;
    const generation = ++requestId.current;
    setPhase({ status: "running" });
    const result = await runAiActions(phase.actions);
    // 실행 중에 닫혔다면 결과를 화면에 되살리지 않는다.
    // 실행 자체는 이미 일어났고, 성공·실패는 실행기가 토스트로 알린다.
    if (generation !== requestId.current) return;
    if (result.ok) {
      handleClose();
      return;
    }
    setPhase({ status: "rejected", reasons: result.reasons ?? [result.summary] });
  }, [handleClose, phase]);

  /** 포커스 트랩 — 팔레트가 열려 있는 동안 Tab이 밖으로 나가지 않게 한다 */
  const trapTab = (event: React.KeyboardEvent) => {
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }

    if (event.key === "Tab") {
      trapTab(event);
      return;
    }

    if (phase.status === "review") {
      if (event.key === "Enter") {
        event.preventDefault();
        void confirm();
      }
      return;
    }

    if (phase.status !== "input") return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((prev) => (prev + delta + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      // 목록을 훑고 있었다면 그 항목을, 아니면 직접 친 문장을 보낸다
      void submit(suggestions[activeIndex] ?? query);
    }
  };

  if (!isOpen) return null;

  const surface = isDarkMode ? "#1b1e29" : "#ffffff";
  const border = isDarkMode
    ? "1px solid rgba(255,255,255,0.09)"
    : "1px solid rgba(0,0,0,0.08)";
  const textColor = isDarkMode ? "#e8eaf2" : "#1f2430";
  const mutedColor = isDarkMode ? "rgba(232,234,242,0.6)" : "rgba(31,36,48,0.6)";

  const descriptions = phase.status === "review" ? describeAiActions(phase.actions) : [];
  const isBusy =
    phase.status === "interpreting" ||
    phase.status === "running" ||
    phase.status === "searching-youtube";

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
        zIndex: 2147483646,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="명령 팔레트"
        onKeyDown={handleKeyDown}
        style={{
          width: "min(620px, calc(100vw - 32px))",
          background: surface,
          border,
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
          color: textColor,
        }}
      >
        <div style={{ position: "relative" }}>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              phase.status === "input" && suggestions.length > 0
                ? `${LISTBOX_ID}-${activeIndex}`
                : undefined
            }
            value={query}
            disabled={isBusy}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              if (phase.status !== "input") setPhase({ status: "input" });
            }}
            placeholder="하고 싶은 것을 문장으로 적어보세요"
            style={{
              width: "100%",
              padding: "18px 92px 18px 20px", // 우측 여유는 뱃지 자리
              fontSize: 17,
              border: "none",
              outline: "none",
              background: "transparent",
              color: textColor,
              boxSizing: "border-box",
            }}
          />
          {/* 남은 AI 호출 뱃지 — 무료 티어 할당량을 사용자에게 미리 알려준다.
              스크린 리더에는 aria-label 하나로만 읽히도록 시각 요소는 aria-hidden. */}
          <span
            aria-label={`남은 AI 호출 ${quotaRemaining}회`}
            style={{
              position: "absolute",
              right: 18,
              top: "50%",
              transform: "translateY(-50%)",
              padding: "3px 9px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.2,
              background: quotaRemaining > 0 ? `${ACCENT}22` : "rgba(217,83,79,0.15)",
              color: quotaRemaining > 0 ? ACCENT : "#d9534f",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            <span aria-hidden="true">남은 AI · {quotaRemaining}</span>
          </span>
        </div>

        {/* 상태 변화는 완료된 문장 단위로 한 번만 알린다.
            토큰이 올 때마다 알리면 스크린 리더가 처음부터 다시 읽어 아무것도 알아들을 수 없다. */}
        <div aria-live="polite" style={SR_ONLY}>
          {phase.status === "interpreting" && "명령을 해석하는 중입니다."}
          {phase.status === "review" && `${descriptions.length}개의 변경을 검토하세요.`}
          {phase.status === "running" && "실행 중입니다."}
          {phase.status === "rejected" && phase.reasons.join(" ")}
          {phase.status === "searching-youtube" && "유튜브 강의를 검색하는 중입니다."}
          {phase.status === "youtube-review" &&
            `${phase.candidates.length}개의 후보 영상을 검토하세요.`}
        </div>

        {phase.status === "input" && suggestions.length > 0 && (
          <ul
            id={LISTBOX_ID}
            role="listbox"
            aria-label="예시 명령"
            style={{ listStyle: "none", margin: 0, padding: "0 0 8px", borderTop: border }}
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion}
                id={`${LISTBOX_ID}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void submit(suggestion);
                }}
                style={{
                  padding: "10px 20px",
                  cursor: "pointer",
                  fontSize: 14,
                  color: index === activeIndex ? textColor : mutedColor,
                  background: index === activeIndex ? `${ACCENT}1f` : "transparent",
                }}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        )}

        {isBusy && (
          <p style={{ ...PANEL, borderTop: border, color: mutedColor }}>
            {phase.status === "interpreting"
              ? "해석하는 중…"
              : phase.status === "searching-youtube"
                ? "유튜브 강의를 찾는 중…"
                : "실행하는 중…"}
          </p>
        )}

        {phase.status === "rejected" && (
          <div style={{ ...PANEL, borderTop: border }}>
            {phase.reasons.map((reason) => (
              <p key={reason} style={{ margin: "0 0 6px", fontSize: 14, color: "#d9534f" }}>
                {reason}
              </p>
            ))}
          </div>
        )}

        {phase.status === "review" && (
          <div style={{ ...PANEL, borderTop: border }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                margin: "0 0 10px",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: mutedColor }}>
                이렇게 바뀝니다
              </p>
              {phase.source === "fallback" && (
                // 서버 429·quota 소진으로 사전 녹화 응답이 쓰였음을 사용자에게 밝힌다.
                // 승인 UI는 정상 흐름과 완전히 같으므로 배지가 유일한 구분이다.
                <span
                  aria-label="오프라인 데모 응답"
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: "rgba(232,160,48,0.15)",
                    color: "#c98a2b",
                  }}
                >
                  오프라인 데모 응답
                </span>
              )}
            </div>
            <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0 }}>
              {descriptions.map((item, index) => (
                <li
                  key={`${item.text}-${index}`}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "6px 0",
                    fontSize: 15,
                    // 실행기가 아직 처리하지 못하는 항목은 흐리게 — 승인 전에 미리 밝힌다
                    color: item.supported ? undefined : mutedColor,
                  }}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={handleClose} style={ghostButton(mutedColor)}>
                무시
              </button>
              <button type="button" onClick={() => void confirm()} style={PRIMARY_BUTTON}>
                실행
              </button>
            </div>
          </div>
        )}

        {phase.status === "youtube-review" && (
          <YoutubeApprovalPanel
            candidates={phase.candidates}
            onApprove={(selected) => void approveYoutube(selected)}
            onCancel={handleClose}
            isDarkMode={isDarkMode}
          />
        )}
      </div>
    </div>,
    document.body
  );
}

const PANEL: React.CSSProperties = { padding: "16px 20px", margin: 0 };

const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

const PRIMARY_BUTTON: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 8,
  border: "none",
  background: ACCENT,
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const ghostButton = (color: string): React.CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color,
  fontSize: 14,
  cursor: "pointer",
});
