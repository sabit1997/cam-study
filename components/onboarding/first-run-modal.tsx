import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useThemeStore } from "@/stores/theme-state";
import { useWindowStore } from "@/stores/window-state";
import { useInterpretCommand } from "@/apis/services/ai-services/mutation";
import { validateAiActions } from "@/utils/ai-action-validate";
import { describeAiActions } from "@/utils/ai-action-describe";
import { runAiActions } from "@/components/ai/ai-action-runner";
import { apiErrorMessage } from "@/utils/api-error";
import type { AiAction } from "@/types/ai-actions";

/**
 * 첫 실행 온보딩 모달.
 *
 * 왜 창이 하나도 없을 때만 뜨는가:
 * - 사용자가 계정을 만들자마자 빈 대시보드를 보면 "이 앱으로 뭘 해야 하지"를 그대로 겪는다.
 * - 하지만 이미 창을 만들어본 사용자에게 온보딩을 다시 보여주면 방해가 된다.
 * - 그래서 조건이 두 개: (a) 창 0개 && (b) localStorage 완료 플래그 없음.
 *
 * 앱 라벨은 여기서 묻지 않는다(설계 문서 §2.3). 프리셋으로 흔한 앱은 답이 정해져 있고,
 * 프리셋에 없는 앱은 실제로 감지된 시점에만 SUGGEST_LABEL 흐름으로 노출된다.
 *
 * 데스크탑 전용 기능(딴짓 감지) 안내는 tracker 유무를 감지해 웹에서만 다운로드 링크로 유도한다.
 */

const STORAGE_KEY = "onboarding.done";
const LAYOUT_PROMPT = "공부용 기본 배치 만들어줘";
const ACCENT = "#8fb870";

type Step =
  | { kind: "intro" }
  | { kind: "layout"; phase: "idle" | "loading" | "review" | "rejected" | "running"; actions?: AiAction[]; reason?: string }
  | { kind: "outro" };

const isBrowser = () => typeof window !== "undefined";

const hasCompletedOnboarding = (): boolean => {
  if (!isBrowser()) return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
};

const markOnboardingDone = (): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // 저장 실패해도 세션 안에서는 완료로 취급.
  }
};

/**
 * tracker 필드는 브랜치 2(feat/distraction-detect)에서 preload에 노출된다.
 * 이 브랜치(feat/onboarding)는 브랜치 1 위에서만 파생돼 아직 globals.d.ts에 없다.
 * 두 브랜치가 병합된 뒤에도 안전하도록 in 연산자로 검사한다.
 */
const hasDesktopTracker = (): boolean =>
  isBrowser() &&
  Boolean(window.electronAPI) &&
  "tracker" in (window.electronAPI as object);

const isDesktopApp = (): boolean => isBrowser() && Boolean(window.electronAPI);

export default function FirstRunModal() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const windows = useWindowStore((state) => state.windows);
  const { mutateAsync: interpretCommand } = useInterpretCommand();

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "intro" });

  // 창 목록이 처음 로드된 시점에 조건을 확인한다. 서버에서 창을 불러오기 전이면 아직 판단하지 않는다.
  useEffect(() => {
    if (hasCompletedOnboarding()) return;
    if (windows.length > 0) {
      // 이미 창이 있는 사용자에게는 온보딩을 보이지 않는다 — 조용히 완료 처리.
      markOnboardingDone();
      return;
    }
    setVisible(true);
  }, [windows.length]);

  const close = useCallback(() => {
    markOnboardingDone();
    setVisible(false);
  }, []);

  const requestLayout = useCallback(async () => {
    setStep({ kind: "layout", phase: "loading" });
    try {
      const { actions } = await interpretCommand({
        text: LAYOUT_PROMPT,
        purpose: "command",
      });
      const validation = validateAiActions(actions);
      if (!validation.ok || validation.actions.length === 0) {
        setStep({
          kind: "layout",
          phase: "rejected",
          reason: validation.ok
            ? "추천을 만들지 못했어요. 다시 눌러보시겠어요?"
            : validation.reasons.join(" "),
        });
        return;
      }
      setStep({ kind: "layout", phase: "review", actions: validation.actions });
    } catch (error) {
      setStep({
        kind: "layout",
        phase: "rejected",
        reason: apiErrorMessage(error, "추천을 받지 못했어요."),
      });
    }
  }, [interpretCommand]);

  const applyLayout = useCallback(async () => {
    if (step.kind !== "layout" || step.phase !== "review" || !step.actions) return;
    setStep({ kind: "layout", phase: "running", actions: step.actions });
    const result = await runAiActions(step.actions);
    if (!result.ok) {
      toast.error("추천 배치 만들기가 일부 실패했어요.");
      setStep({
        kind: "layout",
        phase: "rejected",
        reason: result.reasons?.join(" ") ?? result.summary,
      });
      return;
    }
    setStep({ kind: "outro" });
  }, [step]);

  if (!visible) return null;

  const surface = isDarkMode ? "#1b1e29" : "#ffffff";
  const border = isDarkMode
    ? "1px solid rgba(255,255,255,0.09)"
    : "1px solid rgba(0,0,0,0.08)";
  const textColor = isDarkMode ? "#e8eaf2" : "#1f2430";
  const mutedColor = isDarkMode ? "rgba(232,234,242,0.6)" : "rgba(31,36,48,0.6)";

  const descriptions =
    step.kind === "layout" && step.phase === "review" && step.actions
      ? describeAiActions(step.actions)
      : [];

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
          width: "min(520px, calc(100vw - 32px))",
          background: surface,
          border,
          borderRadius: 14,
          color: textColor,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {step.kind === "intro" && (
          <div style={{ padding: "24px 28px" }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
              CamStudy에 오신 걸 환영해요
            </h2>
            <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: mutedColor }}>
              공부용 워크스페이스를 몇 초 만에 세팅해 드릴게요. 원하지 않으면 나중에
              Cmd+K로 언제든 다시 부를 수 있습니다.
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
              제목·대화 내용은 어디에도 전송하지 않아요. 자연어 명령과 시간 통계만 서버로
              보냅니다. 자세한 내용은 README를 참고하세요.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={close}
                style={ghostButton(mutedColor)}
              >
                건너뛰기
              </button>
              <button
                type="button"
                onClick={() => setStep({ kind: "layout", phase: "idle" })}
                style={primaryButton()}
              >
                시작하기
              </button>
            </div>
          </div>
        )}

        {step.kind === "layout" && (
          <div style={{ padding: "24px 28px" }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              공부용 기본 배치를 추천해 드릴게요
            </h2>
            <p style={{ marginTop: 6, fontSize: 13, color: mutedColor }}>
              AI가 만든 창 배치를 미리 보고 승인하기 전까지 아무것도 만들지 않습니다.
            </p>

            {step.phase === "idle" && (
              <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" onClick={close} style={ghostButton(mutedColor)}>
                  나중에
                </button>
                <button
                  type="button"
                  onClick={() => void requestLayout()}
                  style={primaryButton()}
                >
                  추천 받기
                </button>
              </div>
            )}

            {step.phase === "loading" && (
              <p style={{ marginTop: 16, fontSize: 13, color: mutedColor }}>
                추천 배치를 만드는 중…
              </p>
            )}

            {step.phase === "review" && (
              <>
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
                    onClick={() => void applyLayout()}
                    style={primaryButton()}
                  >
                    이대로 만들기
                  </button>
                </div>
              </>
            )}

            {step.phase === "running" && (
              <p style={{ marginTop: 16, fontSize: 13, color: mutedColor }}>
                창을 만드는 중…
              </p>
            )}

            {step.phase === "rejected" && (
              <>
                <p
                  style={{
                    marginTop: 16,
                    fontSize: 13,
                    color: "#d9534f",
                  }}
                >
                  {step.reason}
                </p>
                <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" onClick={close} style={ghostButton(mutedColor)}>
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={() => void requestLayout()}
                    style={primaryButton()}
                  >
                    다시 시도
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step.kind === "outro" && (
          <div style={{ padding: "24px 28px" }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              시작 준비가 끝났어요 🎉
            </h2>
            <p style={{ marginTop: 6, fontSize: 13, color: mutedColor, lineHeight: 1.6 }}>
              언제든 Cmd+K로 자연어 명령을 쓸 수 있어요. 예를 들어:
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
                    <a
                      href="/download"
                      style={{ color: ACCENT, textDecoration: "underline" }}
                    >
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
