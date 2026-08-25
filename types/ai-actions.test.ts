import { describe, expect, it } from "vitest";
import { aiActionBatchSchema, aiActionSchema } from "./ai-actions";

describe("AI 액션 스키마 (1단계: 구문 검증)", () => {
  it("액션 5종을 모두 통과시킨다", () => {
    const actions = [
      { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
      { type: "ADD_TODO", ref: "t1", text: "캐싱 실습" },
      { type: "PLAY_YOUTUBE", ref: "y1", url: "https://youtu.be/abcdefghijk" },
      { type: "START_POMODORO", workMins: 25, breakMins: 5 },
      { type: "START_STOPWATCH" },
    ];

    expect(aiActionBatchSchema.safeParse(actions).success).toBe(true);
  });

  it("ref는 없어도 된다 (가장 앞의 창을 실행기가 고른다)", () => {
    expect(aiActionSchema.safeParse({ type: "ADD_TODO", text: "할 일" }).success).toBe(true);
    expect(
      aiActionSchema.safeParse({ type: "ADD_TODO", ref: null, text: "할 일" }).success
    ).toBe(true);
  });

  it("화이트리스트에 없는 widget은 거부한다 — 카메라는 사용자 고유 권한", () => {
    const result = aiActionSchema.safeParse({ type: "CREATE_WINDOW", widget: "camera" });
    expect(result.success).toBe(false);
  });

  it("목록에 없는 액션 타입은 거부한다", () => {
    // 창 삭제는 되돌릴 수 없어서 애초에 목록에 없다. 승인을 받게 하는 게 아니라 존재하지 않는다.
    expect(aiActionSchema.safeParse({ type: "CLOSE_WINDOW", id: 234 }).success).toBe(false);
    expect(aiActionSchema.safeParse({ type: "DROP_DATABASE" }).success).toBe(false);
  });

  it("모르는 필드가 섞여 있으면 거부한다", () => {
    const result = aiActionSchema.safeParse({
      type: "START_STOPWATCH",
      windowId: 234,
    });
    expect(result.success).toBe(false);
  });

  it("실제 id처럼 보이는 숫자 ref는 거부한다 — 남의 창 주입 차단", () => {
    const result = aiActionSchema.safeParse({ type: "ADD_TODO", ref: "999", text: "x" });
    expect(result.success).toBe(false);
  });

  it("스키마는 값이 말이 되는지까지는 모른다 — 그래서 2단계 검증이 필요하다", () => {
    // 9999분도 "정수"라서 구문 검증은 통과한다. 범위는 ai-action-validate가 잡는다.
    const result = aiActionSchema.safeParse({
      type: "START_POMODORO",
      workMins: 9999,
      breakMins: 0,
    });
    expect(result.success).toBe(true);
  });
});
