import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useCreateWindow } from "@/apis/services/window-services/mutation";
import { useAddTodo } from "@/apis/services/todo-services/mutation";
import { useWindowStore } from "@/stores/window-state";
import { validateAiActions } from "@/utils/ai-action-validate";
import { planAiActions, type PlannedStep } from "@/utils/ai-action-plan";
import { buildWindowPayload } from "@/utils/window-payload";
import { extractYouTubeId } from "@/utils/extractYouTubeId";
import { waitForTimerCommands } from "@/utils/timer-bridge";
import {
  formatCategoryAnswer,
  formatDistractPatternAnswer,
  formatTotalAnswer,
  getByCategory,
  getDistractPattern,
  getTotal,
} from "@/utils/ai-record-query";

/**
 * 액션 배치를 실제로 실행하는 유일한 지점.
 *
 * 화면에 아무것도 그리지 않는다. 훅을 모아 쓰기 위해서만 존재한다.
 * useAddTodo가 Todos 컴포넌트 안에만 있어야 할 이유는 없다 — 훅의 규칙은
 * "컴포넌트 최상위에서 호출할 것"이지 "특정 컴포넌트에서만 쓸 것"이 아니다.
 *
 * 입력원(Cmd+K 명령이든 활동 감지든)이 몇 개로 늘어나도 실행은 여기 하나로 모인다.
 */

export interface AiRunResult {
  ok: boolean;
  /** 사람이 읽을 수 있는 실행 결과 요약 */
  summary: string;
  reasons?: string[];
  /**
   * 기록 질의 액션이 만든 답변 마크다운. 팔레트가 인라인 답변 카드로 보여준다.
   * 여러 조회가 한 배치에 있어도 순서대로 이어붙인다.
   */
  answer?: string;
}

export type AiRun = (input: unknown) => Promise<AiRunResult>;

/** 실행기를 컴포넌트 밖(팔레트·감지기 등)에서 부를 수 있도록 들고 있는 슬롯 */
let currentRun: AiRun | null = null;

/** React 트리 밖에서 액션을 실행한다. 실행기가 아직 마운트되지 않았으면 실패를 돌려준다. */
export const runAiActions: AiRun = (input) => {
  if (!currentRun) {
    return Promise.resolve({
      ok: false,
      summary: "실행기가 아직 준비되지 않았습니다.",
      reasons: ["AiActionRunner가 마운트되지 않았습니다."],
    });
  }
  return currentRun(input);
};

export default function AiActionRunner() {
  const { mutateAsync: createWindow } = useCreateWindow();
  const { mutateAsync: addTodo } = useAddTodo();
  const bringToFront = useWindowStore((state) => state.bringToFront);

  const run = useCallback<AiRun>(
    async (input) => {
      // AI가 만들었든 콘솔에서 넣었든 같은 문을 지난다. AI라고 특별대우하지 않는다.
      const validation = validateAiActions(input);
      if (!validation.ok) {
        return {
          ok: false,
          summary: "실행할 수 없는 요청입니다.",
          reasons: validation.reasons,
        };
      }

      const steps = planAiActions(validation.actions, extractYouTubeId);
      if (steps.length === 0) {
        return { ok: true, summary: "실행할 동작이 없습니다." };
      }

      /** 이름표 → 방금 만든 진짜 창 id. AI는 이 값을 보지도 쓰지도 못한다. */
      const refToId = new Map<string, number>();
      /** ref 없는 할 일이 여러 개여도 창은 한 번만 만든다 */
      let fallbackTodoWindowId: number | null = null;
      /** 타이머 명령이 여러 개여도 창은 한 번만 만들고 같은 창에 말한다 */
      let timerWindowId: number | null = null;
      const failed: string[] = [];
      let createdWindows = 0;
      let addedTodos = 0;
      let startedTimers = 0;
      const answers: string[] = [];

      /** 지금 화면에서 가장 앞에 있는(= 사용자가 방금 보고 있던) 해당 종류의 창 */
      const topmostWindowId = (type: "todo" | "timer"): number | null => {
        const found = useWindowStore
          .getState()
          .windows.filter((window) => window.type === type)
          .sort((a, b) => b.zIndex - a.zIndex)[0];
        return found?.id ?? null;
      };

      const createWindowStep = async (
        step: Extract<PlannedStep, { kind: "createWindow" }>
      ) => {
        const payload = buildWindowPayload(step.widget, useWindowStore.getState().windows);
        const created = await createWindow({
          ...payload,
          ...(step.url ? { url: step.url } : {}),
        });
        // 새 창이 다른 창 뒤에 숨으면 사용자에게는 "AI가 아무것도 안 했다"로 보인다.
        // 서버가 zIndex 요청값을 그대로 반영하지 않는 경우가 있어 방어적으로 올린다.
        bringToFront(created.id);
        createdWindows += 1;
        if (step.ref) refToId.set(step.ref, created.id);
        // 배치가 CREATE_WINDOW(timer)와 START_POMODORO를 함께 담아 와도 창은 하나여야 한다.
        // 쿼리 리페치가 끝나기 전에는 스토어에 이 창이 없어 topmostWindowId가 못 찾는다 —
        // 여기서 붙잡아두지 않으면 타이머 창이 두 개 열린다.
        if (step.widget === "timer") timerWindowId ??= created.id;
        return created.id;
      };

      /**
       * 명령을 받을 타이머 창을 확보한다.
       *
       * 열려 있는 타이머 창 중 맨 앞의 것을 쓰고, 하나도 없으면 만든다.
       * 새로 만든 창은 서버 응답 → 리페치 → 렌더 → lazy 청크 로드를 거쳐야 마운트되므로
       * 명령 창구가 등록될 때까지 기다린다. 기다리지 않고 쏘면 창만 열리고 타이머는 멈춰 있다.
       */
      const resolveTimerCommands = async () => {
        if (timerWindowId === null) {
          timerWindowId =
            topmostWindowId("timer") ??
            (await createWindowStep({ kind: "createWindow", widget: "timer" }));
        } else {
          // 같은 배치의 두 번째 타이머 명령 — 창은 그대로 두고 앞으로만 올린다.
          bringToFront(timerWindowId);
        }
        return waitForTimerCommands(timerWindowId);
      };

      for (const [index, step] of steps.entries()) {
        const at = `${index + 1}번째 동작`;
        try {
          switch (step.kind) {
            case "createWindow":
              await createWindowStep(step);
              break;

            case "addTodo": {
              let windowId: number;
              if (step.ref) {
                // 검증기가 "같은 배치의 CREATE_WINDOW가 만든 창"임을 보장하므로,
                // 여기에 없다는 건 그 창 생성이 실패했다는 뜻이다. 기존 창으로 폴백하면
                // 사용자가 쓰던 창에 엉뚱한 할 일이 들어간다 — 실패로 남기는 게 맞다.
                const mapped = refToId.get(step.ref);
                if (mapped === undefined) {
                  throw new Error(`이름표 "${step.ref}" 창을 만들지 못했습니다.`);
                }
                windowId = mapped;
              } else {
                // ref가 없으면 맨 앞의 Todo 창을 쓰고, 하나도 없으면 새로 만들어 연결한다.
                windowId =
                  fallbackTodoWindowId ??
                  topmostWindowId("todo") ??
                  (await createWindowStep({ kind: "createWindow", widget: "todo" }));
                fallbackTodoWindowId = windowId;
              }
              await addTodo({ id: windowId, text: step.text });
              addedTodos += 1;
              break;
            }

            case "startPomodoro": {
              const timer = await resolveTimerCommands();
              if (!timer.startPomodoro(step.workMins, step.breakMins)) {
                throw new Error("포모도로를 시작하지 못했습니다.");
              }
              startedTimers += 1;
              break;
            }

            case "startStopwatch": {
              const timer = await resolveTimerCommands();
              if (!timer.startStopwatch()) {
                throw new Error("스톱워치를 시작하지 못했습니다.");
              }
              startedTimers += 1;
              break;
            }

            case "queryTotal": {
              const result = await getTotal(step.from, step.to);
              answers.push(formatTotalAnswer(step.from, step.to, result));
              break;
            }

            case "queryByCategory": {
              const result = await getByCategory(step.from, step.to);
              answers.push(formatCategoryAnswer(step.from, step.to, result));
              break;
            }

            case "queryDistractPattern": {
              const result = await getDistractPattern(
                step.from,
                step.to,
                step.groupBy
              );
              answers.push(
                formatDistractPatternAnswer(
                  step.from,
                  step.to,
                  step.groupBy,
                  result
                )
              );
              break;
            }
          }
        } catch (error) {
          console.error(`[AiActionRunner] ${at} 실패`, error);
          // 직접 던진 오류는 왜 실패했는지 알고 있다. 그 문장을 그대로 보여준다.
          // 네트워크 실패는 apis/request.ts가 Error가 아닌 객체를 던지므로 기본 문장으로 떨어진다.
          const detail = error instanceof Error ? error.message : null;
          failed.push(
            detail ? `${at}: ${detail}` : `${at}(${step.kind})를 실행하지 못했습니다.`
          );
        }
      }

      const done = [
        createdWindows > 0 ? `창 ${createdWindows}개` : null,
        addedTodos > 0 ? `할 일 ${addedTodos}개` : null,
        startedTimers > 0 ? `타이머 ${startedTimers}개` : null,
        answers.length > 0 ? `조회 ${answers.length}건` : null,
      ].filter(Boolean);

      const summary = done.length > 0 ? `${done.join(", ")} 처리했습니다.` : "변경된 것이 없습니다.";
      const answer = answers.length > 0 ? answers.join("\n\n---\n\n") : undefined;

      if (failed.length > 0) {
        toast.error(`${summary} 일부는 실패했습니다.`);
        return { ok: false, summary, reasons: failed, answer };
      }
      // 조회만 있었으면 UI가 살짝 변한 게 없어 토스트 없이 답변만 보여준다.
      if (
        createdWindows === 0 &&
        addedTodos === 0 &&
        startedTimers === 0 &&
        answers.length > 0
      ) {
        return { ok: true, summary, answer };
      }
      toast.success(summary);
      return { ok: true, summary, answer };
    },
    [addTodo, bringToFront, createWindow]
  );

  useEffect(() => {
    currentRun = run;
    return () => {
      if (currentRun === run) currentRun = null;
    };
  }, [run]);

  // 개발 중에는 AI 없이 콘솔에서 액션 객체를 직접 넣어 실행부를 검증할 수 있다.
  // 액션이 그냥 데이터이기 때문에 가능한 일이고, 덕분에 불확실한 요소를 하나씩 제거할 수 있다.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__aiRun = run;
    return () => {
      delete window.__aiRun;
    };
  }, [run]);

  return null;
}
