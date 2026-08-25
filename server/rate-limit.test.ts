import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

const T0 = 1_700_000_000_000;

describe("createRateLimiter", () => {
  it("한도까지는 통과시키고 그 다음을 막는다", () => {
    const limit = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limit("1.1.1.1", T0).allowed).toBe(true);
    expect(limit("1.1.1.1", T0 + 1).allowed).toBe(true);
    expect(limit("1.1.1.1", T0 + 2).allowed).toBe(true);
    expect(limit("1.1.1.1", T0 + 3).allowed).toBe(false);
  });

  it("키가 다르면 서로 영향을 주지 않는다", () => {
    const limit = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limit("1.1.1.1", T0).allowed).toBe(true);
    expect(limit("2.2.2.2", T0).allowed).toBe(true);
    expect(limit("1.1.1.1", T0).allowed).toBe(false);
  });

  it("윈도우가 지나면 다시 통과한다", () => {
    const limit = createRateLimiter({ limit: 2, windowMs: 60_000 });
    limit("1.1.1.1", T0);
    limit("1.1.1.1", T0);
    expect(limit("1.1.1.1", T0 + 59_999).allowed).toBe(false);
    expect(limit("1.1.1.1", T0 + 60_000).allowed).toBe(true);
  });

  it("슬라이딩이다 — 가장 오래된 요청만 만료된다", () => {
    const limit = createRateLimiter({ limit: 2, windowMs: 10_000 });
    limit("k", T0); // 0초
    limit("k", T0 + 9_000); // 9초
    // 10초: 0초 요청이 만료돼 한 자리 생김
    expect(limit("k", T0 + 10_000).allowed).toBe(true);
    // 9초 요청과 10초 요청이 아직 살아 있어 자리가 없음
    expect(limit("k", T0 + 10_001).allowed).toBe(false);
  });

  it("Retry-After는 가장 오래된 요청이 만료되는 시점까지의 초", () => {
    const limit = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limit("k", T0);
    expect(limit("k", T0 + 10_000).retryAfterSec).toBe(50);
    // 1초 미만 남았어도 0을 주면 즉시 재시도해 다시 막힌다
    expect(limit("k", T0 + 59_900).retryAfterSec).toBe(1);
  });

  it("통과한 요청의 retryAfterSec은 0", () => {
    const limit = createRateLimiter({ limit: 1, windowMs: 1_000 });
    expect(limit("k", T0)).toEqual({ allowed: true, retryAfterSec: 0 });
  });

  it("키가 maxKeys를 넘으면 만료된 것을 정리한다", () => {
    const limit = createRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 2 });
    limit("a", T0);
    limit("b", T0);
    // 윈도우가 지난 뒤 새 키가 오면 a·b가 정리되고 c가 자리를 얻는다
    expect(limit("c", T0 + 2_000).allowed).toBe(true);
    expect(limit("c", T0 + 2_000).allowed).toBe(false);
  });

  it("정리해도 자리가 없으면 추적을 포기하고 통과시킨다 — 메모리가 우선", () => {
    const limit = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    limit("a", T0);
    limit("b", T0);
    // a·b 모두 살아 있어 정리할 것이 없다. c는 막지 않는다.
    expect(limit("c", T0).allowed).toBe(true);
    // 이미 추적 중인 키는 계속 정상 동작한다
    expect(limit("a", T0).allowed).toBe(false);
  });
});
