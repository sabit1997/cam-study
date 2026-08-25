import type { AiAction } from "@/types/ai-actions";
import type { OnboardingWindowSpec } from "@/apis/services/ai-services/service";

/**
 * 온보딩 어시스턴트가 반환한 windows 스펙을 AiAction 배열로 조립한다.
 *
 * 왜 여기서 조립하나:
 * - LLM에게 AiAction 스키마를 통째로 학습시키면 프롬프트가 무거워지고 오류가 는다.
 * - "만들 창"의 최소 정보(widget + 선택적 todos)만 받아 액션으로 옮기면 규약이 좁아진다.
 * - ref는 이 파일에서 안전하게 생성한다 — LLM이 지어낸 ref로 충돌·검증 실패를 낼 여지가 없다.
 */

export const buildOnboardingActions = (
  windows: OnboardingWindowSpec[]
): AiAction[] => {
  const out: AiAction[] = [];
  let counter = 0;
  for (const w of windows) {
    if (w.widget === "todo" && w.todos && w.todos.length > 0) {
      counter += 1;
      const ref = `ob${counter}`;
      out.push({ type: "CREATE_WINDOW", widget: "todo", ref });
      for (const text of w.todos) {
        out.push({ type: "ADD_TODO", ref, text });
      }
    } else {
      out.push({ type: "CREATE_WINDOW", widget: w.widget });
    }
  }
  return out;
};
