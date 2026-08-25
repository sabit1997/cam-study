import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_BUDGET,
  WEIGHTS,
  consume,
  getRemaining,
  reset,
} from "./ai-quota";

/**
 * jsdom 없이 돌리기 위해 최소한의 localStorage 흉내를 window에 주입한다.
 * quota는 이 파일 하나만 신뢰하면 되므로 실제 브라우저 API를 모두 채워둘 필요는 없다.
 */
const installLocalStorage = () => {
  const store = new Map<string, string>();
  const stub = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal("window", { localStorage: stub });
  return store;
};

describe("ai-quota", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("첫 호출 전에는 예산 전체가 남아 있다", () => {
    expect(getRemaining()).toBe(SESSION_BUDGET);
  });

  it("command 한 번은 1 소비", () => {
    const result = consume("command");
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(SESSION_BUDGET - 1);
    expect(getRemaining()).toBe(SESSION_BUDGET - 1);
  });

  it("video-analyze는 command보다 비싸게 셈한다", () => {
    consume("command"); // -1
    consume("video-analyze"); // -3
    expect(getRemaining()).toBe(SESSION_BUDGET - WEIGHTS.command - WEIGHTS["video-analyze"]);
  });

  it("예산을 초과하는 호출은 거부하고 아무것도 소비하지 않는다", () => {
    // 남은 몫을 정확히 2로 만든다 → video-analyze(3)는 통과하지 못해야 한다
    for (let i = 0; i < SESSION_BUDGET - 2; i += 1) consume("command");
    expect(getRemaining()).toBe(2);

    const result = consume("video-analyze");
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(2);
    // 거부됐으면 남은 몫은 그대로여야 한다 — 소비되면 사용자에게 몫을 잘못 알려준다
    expect(getRemaining()).toBe(2);
  });

  it("정확히 예산에 맞는 호출은 통과하고 remaining=0이 된다", () => {
    for (let i = 0; i < SESSION_BUDGET; i += 1) consume("command");
    expect(getRemaining()).toBe(0);
    // 그 다음은 어떤 purpose든 거부돼야 한다
    expect(consume("command").ok).toBe(false);
    expect(consume("label-suggest").ok).toBe(false);
  });

  it("날짜가 바뀌면 예산이 리셋된다 — 자정 기준", () => {
    const day1 = new Date("2026-03-15T12:00:00");
    const day2 = new Date("2026-03-16T00:05:00");

    for (let i = 0; i < 5; i += 1) consume("command", day1);
    expect(getRemaining(day1)).toBe(SESSION_BUDGET - 5);

    // 다음 날에는 완전히 새 예산
    expect(getRemaining(day2)).toBe(SESSION_BUDGET);
  });

  it("localStorage에 이상값이 있으면 조용히 리셋한다", () => {
    // 앱 크래시로 확대할 이유가 없다. 데이터를 신뢰하지 못하는 상황은 초기화로 답한다.
    window.localStorage.setItem("aiQuota", "not json");
    expect(getRemaining()).toBe(SESSION_BUDGET);

    window.localStorage.setItem("aiQuota", JSON.stringify({ date: "2026-01-01", used: -5 }));
    expect(getRemaining(new Date("2026-01-01T00:00:00"))).toBe(SESSION_BUDGET);
  });

  it("reset은 상태를 지운다", () => {
    consume("command");
    reset();
    expect(getRemaining()).toBe(SESSION_BUDGET);
  });
});
