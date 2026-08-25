import type { AiAction, AiActionType } from "@/types/ai-actions";

/**
 * 액션 → 사람이 읽는 한 줄.
 *
 * 승인 창에 "타이머를 시작할까요? [예][아니오]"만 띄우면 사용자는 뭐가 바뀌는지 모른 채
 * 습관적으로 [예]를 누르게 된다. 그러면 승인 절차가 있어도 실질적으로는 없는 것과 같다.
 * 그래서 바뀔 내용을 전부 나열한다.
 *
 * 이게 가능한 건 액션이 함수 호출이 아니라 데이터이기 때문이다.
 * AI가 함수를 바로 호출하는 구조였다면 미리 그릴 수 있는 게 아무것도 없다.
 */

export interface AiActionDescription {
  icon: string;
  text: string;
  /**
   * 실행기가 실제로 처리할 수 있는 액션인가.
   *
   * false면 승인 화면에서 흐리게 표시하고, 실행하면 실패로 보고된다.
   * "될 것처럼 보여주고 안 되는 것"이 승인 UI가 할 수 있는 가장 나쁜 거짓말이라
   * 미리보기 단계에서 미리 밝힌다.
   */
  supported: boolean;
}

/**
 * 스키마에는 있지만 실행기가 아직 연결하지 못한 액션.
 *
 * components/timer.tsx가 타이머 상태를 컴포넌트 로컬에 들고 있어서, 밖에서 시작시킬
 * 방법이 없다. Phase D에서 스토어로 리프팅하면 이 집합이 비워진다.
 * 실행기(components/ai/ai-action-runner.tsx)와 반드시 함께 바뀌어야 한다.
 */
const UNSUPPORTED_ACTION_TYPES = new Set<AiActionType>([
  "START_POMODORO",
  "START_STOPWATCH",
]);

const WIDGET_LABEL: Record<string, string> = {
  todo: "할 일 목록",
  timer: "타이머",
  youtube: "유튜브",
  window: "화면 공유",
};

/** 너무 긴 할 일은 미리보기에서만 줄인다 (실제로 저장되는 값은 그대로다) */
const preview = (text: string, max = 40) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const label = (action: AiAction): { icon: string; text: string } => {
  switch (action.type) {
    case "CREATE_WINDOW":
      return {
        icon: "➕",
        text: `${WIDGET_LABEL[action.widget] ?? action.widget} 창 열기`,
      };

    case "ADD_TODO":
      return { icon: "✓", text: `할 일 추가: "${preview(action.text.trim())}"` };

    case "PLAY_YOUTUBE":
      return { icon: "▶", text: "유튜브 영상 재생" };

    case "START_POMODORO":
      return {
        icon: "⏱",
        text: `${action.workMins}분 집중 / ${action.breakMins}분 휴식 포모도로 시작`,
      };

    case "START_STOPWATCH":
      return { icon: "⏱", text: "스톱워치 시작" };

    case "GET_TOTAL":
      return {
        icon: "📊",
        text: `${action.from}부터 ${action.to}까지 총 공부시간 조회`,
      };

    case "GET_BY_CATEGORY":
      return {
        icon: "📊",
        text: `${action.from}부터 ${action.to}까지 카테고리별 시간 조회`,
      };

    case "GET_DISTRACT_PATTERN": {
      const groupLabel = { day: "일별", weekday: "요일별", hour: "시간대별" }[
        action.groupBy
      ];
      return {
        icon: "📊",
        text: `${action.from}부터 ${action.to}까지 딴짓 패턴(${groupLabel}) 조회`,
      };
    }
  }
};

export const describeAiAction = (action: AiAction): AiActionDescription => {
  const supported = !UNSUPPORTED_ACTION_TYPES.has(action.type);
  const { icon, text } = label(action);
  return {
    icon,
    text: supported ? text : `${text} (아직 지원 안 됨)`,
    supported,
  };
};

export const describeAiActions = (actions: AiAction[]): AiActionDescription[] =>
  actions.map(describeAiAction);
