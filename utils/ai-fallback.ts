import type { AiAction } from "@/types/ai-actions";
import { COMMAND_SUGGESTIONS } from "@/utils/command-suggestions";

/**
 * 예시 명령에 대한 사전 녹화 응답.
 *
 * 왜 필요한가:
 * - 무료 티어 할당량이 소진되면 서버는 429를 준다. 명령 팔레트가 그걸 그대로 에러로 보여주면
 *   리뷰어(발표 관람자)가 "AI가 켜져 있는가"부터 의심하게 된다.
 * - 예시 문장들은 사용자가 팔레트를 처음 열었을 때 가장 먼저 눌러보는 항목이다.
 *   그것들이 429에서도 동작하면 데모의 얼굴이 무너지지 않는다.
 *
 * 여기에 담긴 액션은 실제 interpret이 자주 만드는 결과의 스냅숏이 아니라,
 * 각 예시 문장이 "말이 되는 최소한의 결과" — 즉 창을 만드는 정도까지다.
 * 실행기는 이 액션 배열을 정상 응답과 똑같이 받는다(runAiActions 유일 실행 지점).
 */

/**
 * 예시 문장 → 액션 배열.
 * COMMAND_SUGGESTIONS에 있는 문장만 담는다(타입이 전부 채우도록 강제한다). 그 밖의 문장은 fallback 대상이 아니다.
 */
const FALLBACK_MAP: Record<(typeof COMMAND_SUGGESTIONS)[number], AiAction[]> = {
  "코딩테스트 공부 세션 만들어줘": [
    { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
    { type: "CREATE_WINDOW", widget: "timer" },
    { type: "ADD_TODO", ref: "t1", text: "코딩테스트 문제 풀이" },
    { type: "ADD_TODO", ref: "t1", text: "오답 정리" },
    { type: "ADD_TODO", ref: "t1", text: "복습 노트 작성" },
  ],
  "React 공부 할 일 3개 만들어줘": [
    { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
    { type: "ADD_TODO", ref: "t1", text: "React 훅 정리" },
    { type: "ADD_TODO", ref: "t1", text: "예제 코드 실습" },
    { type: "ADD_TODO", ref: "t1", text: "공식 문서 읽기" },
  ],
  // 타이머 창은 실행기가 알아서 확보하므로 CREATE_WINDOW를 붙이지 않는다.
  // 붙이면 창이 두 개 열린다(components/ai/ai-action-runner.tsx의 resolveTimerCommands).
  "45분 집중 15분 휴식 포모도로 시작해줘": [
    { type: "START_POMODORO", workMins: 45, breakMins: 15 },
  ],
  "할 일 목록 창 열어줘": [{ type: "CREATE_WINDOW", widget: "todo" }],
  "타이머 창 열어줘": [{ type: "CREATE_WINDOW", widget: "timer" }],
  "유튜브 창 열어줘": [{ type: "CREATE_WINDOW", widget: "youtube" }],
};

const normalize = (text: string): string => text.trim();

export const isFallbackAvailable = (text: string): boolean =>
  normalize(text) in FALLBACK_MAP;

/**
 * 사용자가 친 문장이 예시 목록과 정확히 일치할 때만 fallback을 준다.
 * 유사도 매칭은 하지 않는다 — 예시가 아닌 문장에 자동 응답을 지어 보이면 데모의 정확도가 무너진다.
 */
export const getFallbackActions = (text: string): AiAction[] | null => {
  const key = normalize(text) as keyof typeof FALLBACK_MAP;
  return FALLBACK_MAP[key] ?? null;
};
