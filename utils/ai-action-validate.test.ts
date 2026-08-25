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

  describe("기록 질의 액션", () => {
    // 미래 날짜 케이스를 안정적으로 검사하기 위해 "먼 과거"를 기준으로 잡는다.
    const past = "2020-01-01";
    const pastEnd = "2020-01-31";

    it("GET_TOTAL: 정상 범위 통과", () => {
      const result = validateAiActions([
        { type: "GET_TOTAL", from: past, to: pastEnd },
      ]);
      expect(result.ok).toBe(true);
    });

    it("GET_BY_CATEGORY: 정상 범위 통과", () => {
      expect(
        ok([{ type: "GET_BY_CATEGORY", from: past, to: pastEnd }])
      ).toBe(true);
    });

    it("GET_DISTRACT_PATTERN: groupBy가 세 값 중 하나여야 한다", () => {
      expect(
        ok([{ type: "GET_DISTRACT_PATTERN", from: past, to: pastEnd, groupBy: "day" }])
      ).toBe(true);
      expect(
        ok([{ type: "GET_DISTRACT_PATTERN", from: past, to: pastEnd, groupBy: "invalid" }])
      ).toBe(false);
    });

    it("YYYY-MM-DD가 아닌 날짜는 거절", () => {
      expect(ok([{ type: "GET_TOTAL", from: "2020/01/01", to: pastEnd }])).toBe(false);
      expect(ok([{ type: "GET_TOTAL", from: "2020-1-1", to: pastEnd }])).toBe(false);
    });

    it("실제로 존재하지 않는 날짜는 거절 (2월 30일 등)", () => {
      expect(ok([{ type: "GET_TOTAL", from: "2020-02-30", to: pastEnd }])).toBe(false);
    });

    it("from > to는 거절", () => {
      expect(ok([{ type: "GET_TOTAL", from: pastEnd, to: past }])).toBe(false);
    });

    it("365일 초과 범위는 거절", () => {
      expect(ok([{ type: "GET_TOTAL", from: "2019-01-01", to: "2020-06-30" }])).toBe(false);
    });

    it("미래 날짜는 거절", () => {
      expect(ok([{ type: "GET_TOTAL", from: "2999-01-01", to: "2999-01-31" }])).toBe(false);
    });

    it("기록 질의는 창·할일 한도에서 제외된다", () => {
      // 창 4개(한도) + 기록 질의 여러 개가 한 배치에 있어도 통과
      const batch = [
        { type: "CREATE_WINDOW", widget: "todo" },
        { type: "CREATE_WINDOW", widget: "timer" },
        { type: "CREATE_WINDOW", widget: "youtube" },
        { type: "CREATE_WINDOW", widget: "window" },
        { type: "GET_TOTAL", from: past, to: pastEnd },
        { type: "GET_BY_CATEGORY", from: past, to: pastEnd },
      ];
      expect(ok(batch)).toBe(true);
    });
  });
});
