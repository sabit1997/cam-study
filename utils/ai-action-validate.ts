import {
  aiActionBatchSchema,
  type AiAction,
  type AiWidget,
} from "@/types/ai-actions";
import { AI_LIMITS } from "@/types/ai-limits";
import { extractYouTubeId } from "./extractYouTubeId";

/**
 * 2단계 검증: 값이 말이 되는가.
 *
 * 1단계(types/ai-actions.ts의 스키마)는 모양과 타입만 보장한다. 포모도로 9999분도
 * "정수"라서 통과한다. 여기서는 각 규칙이 구체적으로 어떤 사고를 막는지 함께 적어둔다.
 * 이유를 같이 적어야 나중에 "이 규칙 왜 있지?" 하고 지우는 일이 안 생긴다.
 *
 * 실행 전에 배치 전체를 검사하고, 전부 통과한 배치만 실행한다.
 * 창 3개를 만들다 2번째에서 실패해 1개만 덩그러니 열린 상태를 예방하기 위해서다.
 */


export { AI_LIMITS };

export type AiActionValidation =
  | { ok: true; actions: AiAction[] }
  | { ok: false; reasons: string[] };

/** ADD_TODO / PLAY_YOUTUBE가 ref로 가리켜도 되는 창 종류 */
const REF_TARGET_WIDGET: Record<"ADD_TODO" | "PLAY_YOUTUBE", AiWidget> = {
  ADD_TODO: "todo",
  PLAY_YOUTUBE: "youtube",
};

const checkBusinessRules = (actions: AiAction[]): string[] => {
  const reasons: string[] = [];

  if (actions.length > AI_LIMITS.MAX_ACTIONS) {
    reasons.push(`한 번에 실행할 수 있는 동작은 최대 ${AI_LIMITS.MAX_ACTIONS}개입니다.`);
  }

  let windowCount = 0;
  let todoCount = 0;
  /** 이 배치 안에서 CREATE_WINDOW로 만들어진 ref만 기록한다 */
  const declaredRefs = new Map<string, AiWidget>();

  actions.forEach((action, index) => {
    const at = `${index + 1}번째 동작`;

    switch (action.type) {
      case "CREATE_WINDOW": {
        windowCount += 1;
        if (action.ref) {
          if (declaredRefs.has(action.ref)) {
            reasons.push(`${at}: 이미 사용한 이름표 "${action.ref}"입니다.`);
          }
          declaredRefs.set(action.ref, action.widget);
        }
        break;
      }

      case "ADD_TODO": {
        todoCount += 1;
        if (todoCount > AI_LIMITS.MAX_TODOS) {
          reasons.push(`한 번에 할 일은 최대 ${AI_LIMITS.MAX_TODOS}개까지 추가할 수 있습니다.`);
        }
        const text = action.text.trim();
        if (text.length === 0) {
          reasons.push(`${at}: 할 일 내용이 비어 있습니다.`);
        }
        if (action.text.length > AI_LIMITS.MAX_TODO_LENGTH) {
          reasons.push(
            `${at}: 할 일은 ${AI_LIMITS.MAX_TODO_LENGTH}자를 넘을 수 없습니다.`
          );
        }
        break;
      }

      case "PLAY_YOUTUBE": {
        // 사용자가 URL을 입력할 때 쓰던 검증을 AI 출력에도 그대로 쓴다.
        // AI 입력과 사람 입력을 같은 기준으로 다룬다는 원칙이 코드로 드러나는 지점.
        if (!extractYouTubeId(action.url)) {
          reasons.push(`${at}: 재생할 수 없는 YouTube 주소입니다.`);
        }
        // ref 없는 재생은 실행기가 새 유튜브 창을 만든다(열려 있는 창은 마운트 시
        // 1회만 목록을 읽어서 나중에 추가해도 안 보인다). 그래서 창 개수로 함께 센다.
        if (!action.ref) windowCount += 1;
        break;
      }

      case "START_POMODORO": {
        const { MIN_MINUTES: min, MAX_MINUTES: max } = AI_LIMITS;
        if (action.workMins < min || action.workMins > max) {
          reasons.push(`${at}: 집중 시간은 ${min}~${max}분 사이여야 합니다.`);
        }
        if (action.breakMins < min || action.breakMins > max) {
          reasons.push(`${at}: 휴식 시간은 ${min}~${max}분 사이여야 합니다.`);
        }
        break;
      }

      case "START_STOPWATCH":
        break;
    }
  });

  if (windowCount > AI_LIMITS.MAX_WINDOWS) {
    reasons.push(`한 번에 창은 최대 ${AI_LIMITS.MAX_WINDOWS}개까지 만들 수 있습니다.`);
  }

  // ref 무결성은 배치를 한 번 다 훑은 뒤에 본다.
  // 규칙: 같은 배치 안에서 만들어진 창만, 그리고 종류가 맞는 창만 가리킬 수 있다.
  // 이게 없으면 ref 자리에 아무 값이나 넣어 다른 창에 데이터를 꽂을 수 있다.
  actions.forEach((action, index) => {
    if (action.type !== "ADD_TODO" && action.type !== "PLAY_YOUTUBE") return;
    if (!action.ref) return;

    const at = `${index + 1}번째 동작`;
    const widget = declaredRefs.get(action.ref);
    if (!widget) {
      reasons.push(`${at}: 이 배치에서 만들지 않은 창("${action.ref}")은 가리킬 수 없습니다.`);
      return;
    }
    const expected = REF_TARGET_WIDGET[action.type];
    if (widget !== expected) {
      reasons.push(`${at}: "${action.ref}"는 ${expected} 창이 아닙니다.`);
    }
  });

  return reasons;
};

/** 순서 문제: ref는 반드시 자기를 만든 CREATE_WINDOW 뒤에 와야 한다 */
const checkRefOrder = (actions: AiAction[]): string[] => {
  const seen = new Set<string>();
  const reasons: string[] = [];

  actions.forEach((action, index) => {
    if (action.type === "CREATE_WINDOW") {
      if (action.ref) seen.add(action.ref);
      return;
    }
    if (action.type !== "ADD_TODO" && action.type !== "PLAY_YOUTUBE") return;
    if (action.ref && !seen.has(action.ref)) {
      reasons.push(
        `${index + 1}번째 동작: 아직 만들지 않은 창("${action.ref}")을 먼저 가리켰습니다.`
      );
    }
  });

  return reasons;
};

/**
 * LLM 출력이든 콘솔 입력이든, 실행되기 전에 반드시 여기를 통과해야 한다.
 * AI를 특별대우하지 않는다 — 입력원과 무관하게 같은 문을 지난다.
 */
export const validateAiActions = (input: unknown): AiActionValidation => {
  const parsed = aiActionBatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reasons: parsed.error.issues.map(
        (issue) =>
          `${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`
      ),
    };
  }

  const actions = parsed.data;
  const reasons = [...checkBusinessRules(actions), ...checkRefOrder(actions)];

  // 중복 사유 제거 — 같은 한도를 여러 번 넘겨도 사용자에게는 한 줄이면 충분하다
  const unique = [...new Set(reasons)];
  return unique.length > 0 ? { ok: false, reasons: unique } : { ok: true, actions };
};
