import { describe, expect, it } from "vitest";
import { AI_LIMITS, validateAiActions } from "./ai-action-validate";

const ok = (input: unknown) => validateAiActions(input).ok;
const reasons = (input: unknown) => {
  const result = validateAiActions(input);
  return result.ok ? [] : result.reasons;
};

describe("validateAiActions — 2단계 검증", () => {
  it("정상 배치를 통과시킨다", () => {
    const result = validateAiActions([
      { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
      { type: "ADD_TODO", ref: "t1", text: "React Query 캐싱 실습" },
      { type: "START_POMODORO", workMins: 50, breakMins: 10 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.actions).toHaveLength(3);
  });

  it("빈 배열은 유효하다 — AI가 확신이 없을 때의 정상 응답", () => {
    // 침묵이 오답보다 낫다. 무엇을 할지 모르겠으면 아무것도 만들지 않는 게 맞다.
    expect(validateAiActions([])).toEqual({ ok: true, actions: [] });
  });

  it("1단계에서 걸러진 것도 사유를 준다", () => {
    expect(ok([{ type: "CREATE_WINDOW", widget: "camera" }])).toBe(false);
    expect(ok("액션 배열이 아님")).toBe(false);
    expect(reasons([{ type: "NOPE" }]).length).toBeGreaterThan(0);
  });

  describe("포모도로 시간 — 9999분 타이머로 UI가 깨지는 것을 막는다", () => {
    it("범위 안이면 통과", () => {
      expect(ok([{ type: "START_POMODORO", workMins: 1, breakMins: 180 }])).toBe(true);
    });
    it("범위를 벗어나면 거부", () => {
      expect(ok([{ type: "START_POMODORO", workMins: 9999, breakMins: 5 }])).toBe(false);
      expect(ok([{ type: "START_POMODORO", workMins: 25, breakMins: 0 }])).toBe(false);
      expect(ok([{ type: "START_POMODORO", workMins: -5, breakMins: 5 }])).toBe(false);
    });
  });

  describe("창 생성 개수 — 화면이 창으로 뒤덮이는 것을 막는다", () => {
    const windows = (n: number) =>
      Array.from({ length: n }, () => ({ type: "CREATE_WINDOW", widget: "todo" }));

    it("한도까지는 통과", () => {
      expect(ok(windows(AI_LIMITS.MAX_WINDOWS))).toBe(true);
    });
    it("한도를 넘으면 거부", () => {
      expect(ok(windows(AI_LIMITS.MAX_WINDOWS + 1))).toBe(false);
    });
  });

  describe("Todo 개수·길이 — 서버 스팸과 레이아웃 붕괴를 막는다", () => {
    const todos = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ type: "ADD_TODO", text: `할 일 ${i}` }));

    it("한도까지는 통과", () => {
      expect(ok(todos(AI_LIMITS.MAX_TODOS))).toBe(true);
    });
    it("개수 한도를 넘으면 거부", () => {
      expect(ok(todos(AI_LIMITS.MAX_TODOS + 1))).toBe(false);
    });
    it("길이 한도를 넘으면 거부", () => {
      const long = "가".repeat(AI_LIMITS.MAX_TODO_LENGTH + 1);
      expect(ok([{ type: "ADD_TODO", text: long }])).toBe(false);
    });
    it("공백뿐인 할 일은 거부", () => {
      expect(ok([{ type: "ADD_TODO", text: "   " }])).toBe(false);
    });
  });

  describe("YouTube URL — 임의 URL 삽입을 막는다", () => {
    it("사용자 입력과 같은 기준(extractYouTubeId)을 통과하면 OK", () => {
      expect(ok([{ type: "PLAY_YOUTUBE", url: "https://youtu.be/dQw4w9WgXcQ" }])).toBe(true);
      expect(
        ok([{ type: "PLAY_YOUTUBE", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }])
      ).toBe(true);
    });
    it("유튜브가 아닌 주소는 거부", () => {
      expect(ok([{ type: "PLAY_YOUTUBE", url: "https://evil.example.com/steal" }])).toBe(false);
      expect(ok([{ type: "PLAY_YOUTUBE", url: "javascript:alert(1)" }])).toBe(false);
      expect(ok([{ type: "PLAY_YOUTUBE", url: "그냥 문자열" }])).toBe(false);
    });
  });

  describe("ref 유효성 — 남의 창에 데이터 주입을 막는다", () => {
    it("같은 배치에서 만든 창은 가리킬 수 있다", () => {
      expect(
        ok([
          { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
          { type: "ADD_TODO", ref: "t1", text: "x" },
        ])
      ).toBe(true);
    });

    it("배치에서 만들지 않은 ref는 거부한다", () => {
      expect(ok([{ type: "ADD_TODO", ref: "abc", text: "x" }])).toBe(false);
    });

    it("아직 만들지 않은 창을 먼저 가리키면 거부한다 (순서)", () => {
      const result = validateAiActions([
        { type: "ADD_TODO", ref: "t1", text: "x" },
        { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons.some((r) => r.includes("아직 만들지 않은"))).toBe(true);
      }
    });

    it("같은 이름표를 두 번 쓰면 거부한다", () => {
      expect(
        ok([
          { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
          { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
        ])
      ).toBe(false);
    });

    it("종류가 다른 창을 가리키면 거부한다 — 타이머 창에 할 일을 넣을 수 없다", () => {
      expect(
        ok([
          { type: "CREATE_WINDOW", widget: "timer", ref: "x1" },
          { type: "ADD_TODO", ref: "x1", text: "x" },
        ])
      ).toBe(false);
      expect(
        ok([
          { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
          { type: "PLAY_YOUTUBE", ref: "t1", url: "https://youtu.be/dQw4w9WgXcQ" },
        ])
      ).toBe(false);
    });

    it("ref 없이 보내면 통과한다 — 실행기가 가장 앞의 창을 고른다", () => {
      expect(ok([{ type: "ADD_TODO", text: "x" }])).toBe(true);
    });
  });

  it("사유가 중복되지 않는다", () => {
    const list = reasons(
      Array.from({ length: 8 }, () => ({ type: "CREATE_WINDOW", widget: "todo" }))
    );
    expect(new Set(list).size).toBe(list.length);
  });
});

describe("ref 없는 PLAY_YOUTUBE도 창을 만든다 — 창 한도에 함께 센다", () => {
  const yt = { type: "PLAY_YOUTUBE", url: "https://youtu.be/dQw4w9WgXcQ" };

  it("창 생성 + ref 없는 재생의 합이 한도를 넘으면 거부", () => {
    const batch = [
      { type: "CREATE_WINDOW", widget: "todo" },
      { type: "CREATE_WINDOW", widget: "timer" },
      { type: "CREATE_WINDOW", widget: "window" },
      yt,
      yt,
    ];
    expect(validateAiActions(batch).ok).toBe(false);
  });

  it("ref로 연결된 재생은 새 창을 만들지 않으므로 세지 않는다", () => {
    const batch = [
      { type: "CREATE_WINDOW", widget: "youtube", ref: "y1" },
      { type: "PLAY_YOUTUBE", ref: "y1", url: "https://youtu.be/dQw4w9WgXcQ" },
      { type: "PLAY_YOUTUBE", ref: "y1", url: "https://youtu.be/aaaaaaaaaaa" },
      { type: "CREATE_WINDOW", widget: "todo" },
      { type: "CREATE_WINDOW", widget: "timer" },
      { type: "CREATE_WINDOW", widget: "window" },
    ];
    expect(validateAiActions(batch).ok).toBe(true);
  });
});
