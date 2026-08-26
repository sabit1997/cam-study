import { describe, expect, it } from "vitest";
import { describeAiAction, describeAiActions } from "./ai-action-describe";

describe("describeAiAction — 무엇이 바뀌는지 보여준다", () => {
  it("창 생성을 위젯 이름으로 풀어 쓴다", () => {
    expect(describeAiAction({ type: "CREATE_WINDOW", widget: "todo" }).text).toBe(
      "할 일 목록 창 열기"
    );
    expect(describeAiAction({ type: "CREATE_WINDOW", widget: "youtube" }).text).toBe(
      "유튜브 창 열기"
    );
  });

  it("할 일은 내용을 그대로 보여준다", () => {
    expect(describeAiAction({ type: "ADD_TODO", text: "캐싱 실습" }).text).toBe(
      '할 일 추가: "캐싱 실습"'
    );
  });

  it("아주 긴 할 일은 미리보기에서만 줄인다", () => {
    const long = "가".repeat(100);
    const described = describeAiAction({ type: "ADD_TODO", text: long });
    expect(described.text.length).toBeLessThan(60);
    expect(described.text).toContain("…");
  });

  it("포모도로는 몇 분짜리인지 드러낸다 — 이걸 알아야 승인이 의미가 있다", () => {
    expect(
      describeAiAction({ type: "START_POMODORO", workMins: 50, breakMins: 10 }).text
    ).toContain("50분 집중 / 10분 휴식 포모도로 시작");
  });

  it("스톱워치와 유튜브도 문장이 있다", () => {
    expect(describeAiAction({ type: "START_STOPWATCH" }).text).toContain("스톱워치 시작");
    expect(
      describeAiAction({ type: "PLAY_YOUTUBE", url: "https://youtu.be/abcdefghijk" }).text
    ).toBe("유튜브 영상 재생");
  });

  it("실행기가 처리할 수 있는 액션은 supported: true", () => {
    expect(describeAiAction({ type: "CREATE_WINDOW", widget: "todo" }).supported).toBe(
      true
    );
    expect(describeAiAction({ type: "ADD_TODO", text: "x" }).supported).toBe(true);
    expect(
      describeAiAction({ type: "PLAY_YOUTUBE", url: "https://youtu.be/abcdefghijk" })
        .supported
    ).toBe(true);
  });

  it("타이머 액션도 이제 끝까지 동작한다 — 흐리게 표시하지 않는다", () => {
    // utils/timer-bridge.ts로 연결되기 전에는 "아직 지원 안 됨"을 붙였다.
    // 실행기가 실제로 처리하는데도 그 꼬리표가 남아 있으면 사용자는 안 될 거라 생각하고 취소한다.
    const pomodoro = describeAiAction({
      type: "START_POMODORO",
      workMins: 25,
      breakMins: 5,
    });
    expect(pomodoro.supported).toBe(true);
    expect(pomodoro.text).not.toContain("아직 지원 안 됨");

    const stopwatch = describeAiAction({ type: "START_STOPWATCH" });
    expect(stopwatch.supported).toBe(true);
    expect(stopwatch.text).not.toContain("아직 지원 안 됨");
  });

  it("액션 5종 모두 아이콘과 문장을 갖는다", () => {
    const all = describeAiActions([
      { type: "CREATE_WINDOW", widget: "timer" },
      { type: "ADD_TODO", text: "x" },
      { type: "PLAY_YOUTUBE", url: "https://youtu.be/abcdefghijk" },
      { type: "START_POMODORO", workMins: 25, breakMins: 5 },
      { type: "START_STOPWATCH" },
    ]);
    expect(all).toHaveLength(5);
    for (const item of all) {
      expect(item.icon).toBeTruthy();
      expect(item.text.length).toBeGreaterThan(0);
    }
  });
});
