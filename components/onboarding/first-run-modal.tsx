import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useThemeStore } from "@/stores/theme-state";
import { useUserStore } from "@/stores/user-state";
import { useWindows } from "@/apis/services/window-services/query";
import AiService, {
  type ChatMessage,
  type OnboardingReply,
} from "@/apis/services/ai-services/service";
import { validateAiActions } from "@/utils/ai-action-validate";
import { describeAiActions } from "@/utils/ai-action-describe";
import { runAiActions } from "@/components/ai/ai-action-runner";
import { buildOnboardingActions } from "@/utils/onboarding-windows";
import {
  clearOnboardingPending,
  isOnboardingPending,
} from "@/utils/onboarding-gate";
import { commandPaletteShortcut } from "@/utils/platform-shortcut";
import { IS_LOCAL_MODE } from "@/utils/app-mode";
import type { AiAction } from "@/types/ai-actions";

/**
 * 첫 실행 온보딩 — SSE 스트리밍 채팅 모달.
 *
 * ## 왜 대화형인가
 * "공부용 기본 배치"라는 통용 답은 사람마다 다르다. 캠을 쓰는 사람과 안 쓰는 사람,
 * 유튜브 강의를 듣는 사람과 조용히 하는 사람의 이상적 창 배치가 같을 수 없다.
 * 세 번의 짧은 질문이 정적 프리셋보다 정확한 결과를 낸다.
 *
 * ## 왜 스트리밍인가
 * 정적 스피너는 왜 오래 걸리는지 알려주지 않고 사용자를 조바심으로 밀어넣는다.
 * 글자가 순차적으로 나타나면 "생각 중"이라는 신호가 자연스레 전달되고,
 * 첫 chunk가 빨리 도착하는 것만으로 체감 지연이 크게 줄어든다.
 *
 * ## 조건
 * 이 기기에서 가입하고 방금 첫 로그인한 계정에만 뜬다(utils/onboarding-gate).
 * 게이트는 "완료 표시가 없으면 신규"가 아니라 "가입 표식이 있어야 신규"다.
 * 부정 신호는 저장소를 비우거나 기기를 바꾼 기존 회원까지 신규로 오인했다.
 *
 * 추가로 서버 창 목록 로딩이 끝날 때까지 판단을 미룬다. 창 상태의 초기값은
 * 빈 배열이라 "창 없음"과 "아직 안 불러옴"이 구분되지 않고, 그 틈에 모달이
 * 열리면 창을 이미 가진 사용자에게도 떠버린다.
 */

const ACCENT = "#8fb870";
const KICKSTART_TEXT = "온보딩을 시작할게요.";
const MAX_TURNS = 6;

type Phase =
  | { kind: "intro" }
  | {
      kind: "chat";
      messages: ChatMessage[];
      /** 현재 스트리밍 중인 어시스턴트 텍스트. done 시 messages로 옮겨진다. */
      streaming: string;
      /** 스트림이 실행 중인가. true면 사용자 입력을 막는다. */
      pending: boolean;
      /** 서버 오류·모델 형식 오류로 재시도가 필요할 때 */
      error?: string;
    }
  | {
      kind: "review";
      actions: AiAction[];
      assistantText: string;
      /** 승인 실패 시 chat 단계로 되돌아갈 때 이 이력을 복원한다. */
      messages: ChatMessage[];
    }
  | { kind: "running"; messages: ChatMessage[] }
  | { kind: "outro" };

const isBrowser = () => typeof window !== "undefined";

const hasDesktopTracker = (): boolean =>
  isBrowser() &&
  Boolean(window.electronAPI) &&
  "tracker" in (window.electronAPI as object);

const isDesktopApp = (): boolean => isBrowser() && Boolean(window.electronAPI);

function FirstRunModalInner() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const user = useUserStore((state) => state.user);
  // WindowZone과 같은 queryKey라 요청이 추가로 나가지 않고 캐시를 공유한다.
  const { data: serverWindows, isSuccess } = useWindows();

  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [input, setInput] = useState("");
  /** 스트림 요청·수신 중 세대 번호. 팔레트가 닫히거나 새 요청이 시작되면 무효화. */
  const generationRef = useRef(0);
  /** AbortController — 팔레트가 닫히면 진행 중 스트림도 즉시 취소. */
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!isOnboardingPending(user.userId)) return;
    // 창 목록이 도착하기 전에는 아무것도 판단하지 않는다.
    if (!isSuccess) return;
    if ((serverWindows?.length ?? 0) > 0) {
      // 이미 창이 있는 사용자에게는 온보딩을 보이지 않는다 — 조용히 표식 해제.
      clearOnboardingPending(user.userId);
      return;
    }
    setVisible(true);
  }, [user, isSuccess, serverWindows]);

  const close = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (user) clearOnboardingPending(user.userId);
    setVisible(false);
  }, [user]);

  const requestNextTurn = useCallback(
    async (messages: ChatMessage[]) => {
      const gen = ++generationRef.current;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setPhase({ kind: "chat", messages, streaming: "", pending: true });

      let streaming = "";
      await AiService.onboardingChatStream(messages, {
        signal: ctrl.signal,
        onDelta: (delta) => {
          if (gen !== generationRef.current) return;
          streaming += delta;
          setPhase({
            kind: "chat",
            messages,
            streaming,
            pending: true,
          });
        },
        onDone: ({ reply, visibleText }) => {
          if (gen !== generationRef.current) return;
          handleAssistantDone(messages, visibleText || streaming, reply);
        },
        onError: (err) => {
          if (gen !== generationRef.current) return;
          setPhase({
            kind: "chat",
            messages,
            streaming: "",
            pending: false,
            error: err.error,
          });
        },
      });
    },
    // handleAssistantDone은 useCallback([])로 안정 참조라 리렌더를 유발하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleAssistantDone = useCallback(
    (
      priorMessages: ChatMessage[],
      assistantText: string,
      reply: OnboardingReply | null
    ) => {
      const messages: ChatMessage[] = [
        ...priorMessages,
        { role: "assistant", text: assistantText || "…" },
      ];
      if (reply?.phase === "done") {
        const actions = buildOnboardingActions(reply.windows);
        const validation = validateAiActions(actions);
        if (!validation.ok || validation.actions.length === 0) {
          setPhase({
            kind: "chat",
            messages,
            streaming: "",
            pending: false,
            error: "제안된 창 배치가 앱이 지원하는 형식이 아니에요. 다시 시도해 주세요.",
          });
          return;
        }
        setPhase({
          kind: "review",
          actions: validation.actions,
          assistantText,
          messages,
        });
        return;
      }
      // reply == null (모델 형식 오류) 또는 phase == "ask"
      const turnsUsed = messages.filter((m) => m.role === "assistant").length;
      if (reply === null) {
        setPhase({
          kind: "chat",
          messages,
          streaming: "",
          pending: false,
          error: "응답을 이해하지 못했어요. 다시 시도해 주세요.",
        });
        return;
      }
      if (turnsUsed >= MAX_TURNS) {
        setPhase({
          kind: "chat",
          messages,
          streaming: "",
          pending: false,
          error: "대화가 길어졌어요. 이대로 시작하거나 다시 시도해 주세요.",
        });
        return;
      }
      setPhase({
        kind: "chat",
        messages,
        streaming: "",
        pending: false,
      });
    },
    []
  );

  const startChat = useCallback(() => {
    const initial: ChatMessage[] = [{ role: "user", text: KICKSTART_TEXT }];
    void requestNextTurn(initial);
  }, [requestNextTurn]);

  const sendUserMessage = useCallback(() => {
    if (phase.kind !== "chat" || phase.pending) return;
    const text = input.trim();
    if (!text) return;
    setInput("");
    const next: ChatMessage[] = [...phase.messages, { role: "user", text }];
    void requestNextTurn(next);
  }, [phase, input, requestNextTurn]);

  const retryChat = useCallback(() => {
    if (phase.kind !== "chat") return;
    void requestNextTurn(phase.messages);
  }, [phase, requestNextTurn]);

  const applyReview = useCallback(async () => {
    if (phase.kind !== "review") return;
    // 실패 시 되돌아갈 대화 이력을 running phase에도 물고 간다. 실패했다고 messages를
    // 비우면 사용자가 처음부터 다시 답변해야 해서 UX가 매우 나빠진다.
    const preservedMessages = phase.messages;
    setPhase({ kind: "running", messages: preservedMessages });
    const result = await runAiActions(phase.actions);
    if (!result.ok) {
      toast.error("추천 배치 만들기가 일부 실패했어요.");
      setPhase({
        kind: "chat",
        messages: preservedMessages,
        streaming: "",
        pending: false,
        error: result.reasons?.join(" ") ?? result.summary,
      });
      return;
    }
    setPhase({ kind: "outro" });
  }, [phase]);

  // 창이 닫히면 스트림도 즉시 취소.
  useEffect(() => {
    if (visible) return;
    abortRef.current?.abort();
    abortRef.current = null;
  }, [visible]);

  if (!visible) return null;

  const surface = isDarkMode ? "#1b1e29" : "#ffffff";
  const border = isDarkMode
    ? "1px solid rgba(255,255,255,0.09)"
    : "1px solid rgba(0,0,0,0.08)";
  const textColor = isDarkMode ? "#e8eaf2" : "#1f2430";
  const mutedColor = isDarkMode ? "rgba(232,234,242,0.6)" : "rgba(31,36,48,0.6)";

  const descriptions =
    phase.kind === "review" ? describeAiActions(phase.actions) : [];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="첫 실행 안내"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2147483644,
      }}
    >
      <div
        style={{
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 32px)",
          background: surface,
          border,
          borderRadius: 14,
          color: textColor,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {phase.kind === "intro" && (
          <div style={{ padding: "24px 28px" }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
              CamStudy에 오신 걸 환영해요
            </h2>
            <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: mutedColor }}>
              몇 가지만 여쭤보고 맞춤 공부 워크스페이스를 만들어 드릴게요.
              대화하듯 편하게 답해 주세요.
            </p>
            <div
              style={{
                margin: "16px 0",
                padding: "12px 14px",
                border,
                borderRadius: 10,
                fontSize: 13,
                color: mutedColor,
                background: isDarkMode
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.02)",
              }}
            >
              <strong style={{ color: textColor }}>프라이버시 요약:</strong> 화면 픽셀·창
              제목·대화 내용은 어디에도 전송하지 않아요. 자연어 답변만 AI 서버로
              보냅니다.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={close} style={ghostButton(mutedColor)}>
                건너뛰기
              </button>
              <button type="button" onClick={startChat} style={primaryButton()}>
                시작하기
              </button>
            </div>
          </div>
        )}

        {phase.kind === "chat" && (
          <ChatView
            messages={phase.messages}
            streaming={phase.streaming}
            pending={phase.pending}
            error={phase.error}
            input={input}
            onInputChange={setInput}
            onSend={sendUserMessage}
            onRetry={retryChat}
            onSkip={close}
            border={border}
            surface={surface}
            textColor={textColor}
            mutedColor={mutedColor}
            isDarkMode={isDarkMode}
          />
        )}

        {phase.kind === "review" && (
          <div style={{ padding: "24px 28px" }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              이렇게 만들어 드릴까요?
            </h2>
            <p style={{ marginTop: 8, fontSize: 13, color: mutedColor, lineHeight: 1.6 }}>
              {phase.assistantText}
            </p>
            <ul
              style={{
                listStyle: "none",
                margin: "16px 0",
                padding: 0,
                fontSize: 14,
              }}
            >
              {descriptions.map((item, i) => (
                <li
                  key={`${item.text}-${i}`}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "6px 0",
                    color: item.supported ? undefined : mutedColor,
                  }}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={close} style={ghostButton(mutedColor)}>
                건너뛰기
              </button>
              <button
                type="button"
                onClick={() => void applyReview()}
                style={primaryButton()}
              >
                이대로 만들기
              </button>
            </div>
          </div>
        )}

        {phase.kind === "running" && (
          <div style={{ padding: "24px 28px" }}>
            <p style={{ margin: 0, fontSize: 13, color: mutedColor }}>
              창을 만드는 중…
            </p>
          </div>
        )}

        {phase.kind === "outro" && (
          <div style={{ padding: "24px 28px" }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              시작 준비가 끝났어요 🎉
            </h2>
            <p style={{ marginTop: 6, fontSize: 13, color: mutedColor, lineHeight: 1.6 }}>
              언제든 {commandPaletteShortcut()}로 자연어 명령을 쓸 수 있어요. 예를 들어:
              <br />
              <em style={{ color: textColor }}>&ldquo;React 공부 할 일 3개 만들어줘&rdquo;</em>
            </p>

            {!hasDesktopTracker() && (
              <div
                style={{
                  margin: "16px 0 0",
                  padding: "12px 14px",
                  border,
                  borderRadius: 10,
                  fontSize: 13,
                  color: mutedColor,
                  background: isDarkMode
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(0,0,0,0.02)",
                }}
              >
                <strong style={{ color: textColor }}>
                  {isDesktopApp() ? "딴짓 감지 준비 안내:" : "데스크탑 앱 안내:"}
                </strong>{" "}
                {isDesktopApp()
                  ? "이 버전에는 아직 딴짓 감지가 포함되지 않았어요. 업데이트 후 다시 확인해 주세요."
                  : "카톡·디스코드에 5분 넘게 새는 시간을 자동으로 감지하려면 데스크탑 앱이 필요합니다. 브라우저 샌드박스에서는 다른 앱 이름을 알 수 없기 때문이에요."}
                {!isDesktopApp() && (
                  <>
                    {" "}
                    <a href="/download" style={{ color: ACCENT, textDecoration: "underline" }}>
                      데스크탑 앱 다운로드
                    </a>
                  </>
                )}
              </div>
            )}

            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={close} style={primaryButton()}>
                시작
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * 채팅 뷰. 첫 사용자 메시지("온보딩을 시작할게요")는 kickstart용이라 숨긴다.
 * 그 뒤 어시스턴트·사용자 메시지가 번갈아 뜨고, 스트리밍 중인 어시스턴트 답변은
 * 커서 blink와 함께 실시간으로 성장한다.
 */
interface ChatViewProps {
  messages: ChatMessage[];
  streaming: string;
  pending: boolean;
  error?: string;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onRetry: () => void;
  onSkip: () => void;
  border: string;
  surface: string;
  textColor: string;
  mutedColor: string;
  isDarkMode: boolean;
}

function ChatView({
  messages,
  streaming,
  pending,
  error,
  input,
  onInputChange,
  onSend,
  onRetry,
  onSkip,
  border,
  textColor,
  mutedColor,
  isDarkMode,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 새 chunk가 도착할 때마다 아래로 스크롤한다. 사용자가 위로 스크롤 중이면
  // 방해가 되지만, 온보딩 대화는 짧아 이 트레이드오프가 가치 있다.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  // 스트림이 끝나면 입력창에 포커스.
  useEffect(() => {
    if (!pending) textareaRef.current?.focus();
  }, [pending]);

  const visible = messages.filter((m, i) => !(i === 0 && m.role === "user"));

  return (
    <>
      <div
        ref={scrollRef}
        style={{
          padding: "20px 24px 8px",
          overflowY: "auto",
          minHeight: 240,
          maxHeight: "60vh",
        }}
      >
        {visible.length === 0 && !streaming && !error && (
          <p style={{ margin: 0, fontSize: 13, color: mutedColor }}>
            대화를 준비하고 있어요…
          </p>
        )}
        {visible.map((m, i) => (
          <Bubble
            key={i}
            role={m.role}
            text={m.text}
            textColor={textColor}
            mutedColor={mutedColor}
            isDarkMode={isDarkMode}
          />
        ))}
        {pending && (
          <Bubble
            role="assistant"
            text={streaming || "…"}
            textColor={textColor}
            mutedColor={mutedColor}
            isDarkMode={isDarkMode}
            typing
          />
        )}
        {error && (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 13,
              color: "#d9534f",
            }}
          >
            {error}
          </p>
        )}
      </div>
      <div
        style={{
          padding: "12px 20px 16px",
          borderTop: border,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (error) {
                  onRetry();
                } else {
                  onSend();
                }
              }
            }}
            disabled={pending}
            placeholder={
              pending
                ? "AI가 답변 중…"
                : error
                  ? "Enter로 다시 시도"
                  : "답을 입력하고 Enter"
            }
            rows={2}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              border,
              background: isDarkMode
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.03)",
              color: textColor,
              fontSize: 14,
              fontFamily: "inherit",
              resize: "none",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={error ? onRetry : onSend}
            disabled={pending || (!error && input.trim().length === 0)}
            style={{
              ...primaryButton(),
              opacity: pending || (!error && input.trim().length === 0) ? 0.5 : 1,
              cursor:
                pending || (!error && input.trim().length === 0)
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {error ? "다시 시도" : "보내기"}
          </button>
        </div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onSkip}
            style={{
              ...ghostButton(mutedColor),
              padding: "4px 8px",
              fontSize: 12,
            }}
          >
            건너뛰기
          </button>
        </div>
      </div>
    </>
  );
}

interface BubbleProps {
  role: "user" | "assistant";
  text: string;
  textColor: string;
  mutedColor: string;
  isDarkMode: boolean;
  typing?: boolean;
}

function Bubble({ role, text, textColor, mutedColor, isDarkMode, typing }: BubbleProps) {
  const isUser = role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        margin: "8px 0",
      }}
    >
      <div
        style={{
          maxWidth: "82%",
          padding: "10px 14px",
          borderRadius: 12,
          fontSize: 14,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          color: isUser ? "#fff" : textColor,
          background: isUser
            ? ACCENT
            : isDarkMode
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.04)",
        }}
      >
        {text}
        {typing && (
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 6,
              height: 12,
              marginLeft: 2,
              verticalAlign: "middle",
              background: mutedColor,
              opacity: 0.7,
              animation: "onboardingCaret 1s steps(2) infinite",
            }}
          />
        )}
      </div>
      <style>{`
        @keyframes onboardingCaret {
          0%, 50% { opacity: 0.7; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

const primaryButton = (): React.CSSProperties => ({
  padding: "9px 18px",
  borderRadius: 8,
  border: "none",
  background: ACCENT,
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
});

const ghostButton = (color: string): React.CSSProperties => ({
  padding: "9px 16px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color,
  fontSize: 14,
  cursor: "pointer",
});

// 로컬 모드에서는 AI 온보딩 대화가 없다. 훅 규칙을 어기지 않도록 얇은 게이트만 두고
// 내부 컴포넌트에서 훅을 호출한다.
export default function FirstRunModal() {
  if (IS_LOCAL_MODE) return null;
  return <FirstRunModalInner />;
}
