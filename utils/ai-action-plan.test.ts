import { describe, expect, it } from "vitest";
import { extractYouTubeId } from "./extractYouTubeId";
import { planAiActions } from "./ai-action-plan";
import type { AiAction } from "@/types/ai-actions";

const plan = (actions: AiAction[]) => planAiActions(actions, extractYouTubeId);
const VIDEO = "https://youtu.be/dQw4w9WgXcQ";
const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("planAiActions", () => {
  it("ref로 연결된 재생을 창 생성 안으로 접어 넣는다", () => {
    // 창을 만든 뒤 url을 붙이면 이미 마운트된 창에는 안 나타나므로,
    // 생성 시점에 url을 실어 보내야 한다.
    expect(
      plan([
        { type: "CREATE_WINDOW", widget: "youtube", ref: "y1" },
        { type: "PLAY_YOUTUBE", ref: "y1", url: VIDEO },
      ])
    ).toEqual([{ kind: "createWindow", widget: "youtube", ref: "y1", url: [WATCH] }]);
  });

  it("같은 창을 여러 번 가리키면 재생목록이 된다", () => {
    const steps = plan([
      { type: "CREATE_WINDOW", widget: "youtube", ref: "y1" },
      { type: "PLAY_YOUTUBE", ref: "y1", url: VIDEO },
      { type: "PLAY_YOUTUBE", ref: "y1", url: "https://youtu.be/abcdefghijk" },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      kind: "createWindow",
      url: [WATCH, "https://www.youtube.com/watch?v=abcdefghijk"],
    });
  });

  it("ref 없는 재생은 url을 채운 새 창으로 만든다", () => {
    expect(plan([{ type: "PLAY_YOUTUBE", url: VIDEO }])).toEqual([
      { kind: "createWindow", widget: "youtube", url: [WATCH] },
    ]);
  });

  it("이미 watch 형식인 url은 그대로 쓴다", () => {
    const steps = plan([{ type: "PLAY_YOUTUBE", url: WATCH }]);
    expect(steps[0]).toMatchObject({ url: [WATCH] });
  });

  it("나머지 액션은 순서를 유지하며 1:1로 옮긴다", () => {
    expect(
      plan([
        { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
        { type: "ADD_TODO", ref: "t1", text: "  캐싱 실습  " },
        { type: "START_POMODORO", workMins: 50, breakMins: 10 },
        { type: "START_STOPWATCH" },
      ])
    ).toEqual([
      { kind: "createWindow", widget: "todo", ref: "t1" },
      { kind: "addTodo", ref: "t1", text: "캐싱 실습" },
      { kind: "startPomodoro", workMins: 50, breakMins: 10 },
      { kind: "startStopwatch" },
    ]);
  });

  it("빈 배치는 빈 계획", () => {
    expect(plan([])).toEqual([]);
  });
});
