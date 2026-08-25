import type { AiAction, AiWidget } from "@/types/ai-actions";

/**
 * 검증을 통과한 액션 배치를 "실제로 실행할 단계"로 옮긴다.
 *
 * 액션은 사용자가 말한 것에 가깝고, 단계는 앱이 할 수 있는 것에 가깝다.
 * 둘 사이에 번역이 필요한 이유는 유튜브 창 때문이다.
 *
 * 유튜브 창은 마운트할 때 딱 한 번 서버의 영상 목록을 읽는다(components/youtube-player.tsx).
 * 그래서 창을 만든 다음에 url을 붙이면 이미 열린 창에는 아무것도 안 나타난다.
 * 대신 창을 만들 때 url을 함께 실어 보내면 마운트되면서 알아서 로드된다.
 * 여기서 PLAY_YOUTUBE를 자기가 가리키는 CREATE_WINDOW 안으로 접어 넣는 이유다.
 */

export type PlannedStep =
  | { kind: "createWindow"; widget: AiWidget; ref?: string; url?: string[] }
  | { kind: "addTodo"; ref?: string; text: string }
  | { kind: "startPomodoro"; workMins: number; breakMins: number }
  | { kind: "startStopwatch" }
  // 기록 질의: 러너가 조회 함수를 호출해 답변 마크다운을 만든다.
  // 이 단계들은 UI 리소스(창·할일)를 만들지 않고 팔레트 인라인 답변으로 흘러들어간다.
  | { kind: "queryTotal"; from: string; to: string }
  | { kind: "queryByCategory"; from: string; to: string }
  | {
      kind: "queryDistractPattern";
      from: string;
      to: string;
      groupBy: "day" | "weekday" | "hour";
    };

/**
 * 유튜브 창이 실제로 저장하는 형식(components/youtube-player.tsx)과 맞춘다.
 *
 * 원본 url을 그대로 쓰지 않고 언제나 id로 다시 조립한다. 예전에는 "watch?v="가
 * 들어 있으면 원본을 그대로 저장했는데, 그 분기가 검증을 통과한 이상한 호스트의
 * url을 그대로 남기는 지점이었다. id만 신뢰하면 그 여지가 없다.
 */
const toWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/**
 * @param actions validateAiActions를 통과한 배치
 * @param extractId URL에서 영상 id를 뽑는 함수 (검증에서 쓴 것과 같은 함수를 주입한다)
 */
export const planAiActions = (
  actions: AiAction[],
  extractId: (url: string) => string | null
): PlannedStep[] => {
  const steps: PlannedStep[] = [];
  /** ref → 그 ref로 만들어진 createWindow 단계 (url을 나중에 접어 넣기 위해) */
  const windowByRef = new Map<string, Extract<PlannedStep, { kind: "createWindow" }>>();

  for (const action of actions) {
    switch (action.type) {
      case "CREATE_WINDOW": {
        const step: PlannedStep = {
          kind: "createWindow",
          widget: action.widget,
          ...(action.ref ? { ref: action.ref } : {}),
        };
        steps.push(step);
        if (action.ref) {
          windowByRef.set(action.ref, step as Extract<PlannedStep, { kind: "createWindow" }>);
        }
        break;
      }

      case "PLAY_YOUTUBE": {
        const id = extractId(action.url);
        if (!id) break; // 검증을 통과했으면 여기 오지 않는다
        const watchUrl = toWatchUrl(id);

        const target = action.ref ? windowByRef.get(action.ref) : undefined;
        if (target) {
          // 같은 창을 여러 번 가리키면 재생목록이 된다
          target.url = [...(target.url ?? []), watchUrl];
        } else {
          // ref가 없으면 새 유튜브 창을 url까지 채워서 만든다.
          // "이미 열려 있는 창에 영상 추가"는 다리가 필요해서 MVP 범위 밖이다.
          steps.push({ kind: "createWindow", widget: "youtube", url: [watchUrl] });
        }
        break;
      }

      case "ADD_TODO":
        steps.push({
          kind: "addTodo",
          ...(action.ref ? { ref: action.ref } : {}),
          text: action.text.trim(),
        });
        break;

      case "START_POMODORO":
        steps.push({
          kind: "startPomodoro",
          workMins: action.workMins,
          breakMins: action.breakMins,
        });
        break;

      case "START_STOPWATCH":
        steps.push({ kind: "startStopwatch" });
        break;

      case "GET_TOTAL":
        steps.push({ kind: "queryTotal", from: action.from, to: action.to });
        break;

      case "GET_BY_CATEGORY":
        steps.push({
          kind: "queryByCategory",
          from: action.from,
          to: action.to,
        });
        break;

      case "GET_DISTRACT_PATTERN":
        steps.push({
          kind: "queryDistractPattern",
          from: action.from,
          to: action.to,
          groupBy: action.groupBy,
        });
        break;
    }
  }

  return steps;
};
