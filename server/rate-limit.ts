/**
 * 아주 작은 슬라이딩 윈도우 레이트리미터.
 *
 * server/ai-interpret.ts처럼 프레임워크를 모른다. 시각(now)을 주입받으므로
 * 타이머를 흉내내지 않고 테스트할 수 있다. HTTP 관심사(어떤 헤더로 키를 만들지,
 * 몇 번을 반환할지)는 어댑터인 api/ai-interpret.ts가 맡는다.
 *
 * ## 한계 — 알고 쓰는 것이 중요하다
 *
 * 상태가 프로세스 메모리에 있다. 서버리스에서는 인스턴스마다 별도 카운터이므로
 * 실제 상한은 "limit × 살아 있는 인스턴스 수"까지 늘어날 수 있고, 콜드 스타트가
 * 나면 0으로 초기화된다. 즉 **정확한 상한이 아니라 남용 억제 장치다.**
 *
 * 그래도 값어치가 있는 이유: 무료 티어 할당량을 태우는 남용은 한 곳에서 빠르게
 * 반복 호출하는 형태라 같은 인스턴스로 몰리고, 그때 이 카운터가 걸린다.
 * 정확한 상한이 필요해지면 이 인터페이스를 유지한 채 KV 구현으로 갈아끼우면 된다.
 */

export interface RateLimitVerdict {
  allowed: boolean;
  /** 429와 함께 내려줄 Retry-After 초. allowed면 0. */
  retryAfterSec: number;
}

export interface RateLimiterOptions {
  /** 윈도우 안에서 허용할 요청 수 */
  limit: number;
  windowMs: number;
  /**
   * 추적할 최대 키 수. 넘으면 만료된 키를 정리하고, 그래도 넘으면 새 키를 받지 않고
   * 통과시킨다. 레이트리밋 때문에 메모리가 무한히 늘어나는 게 더 큰 사고다.
   */
  maxKeys?: number;
}

export type RateLimiter = (key: string, now: number) => RateLimitVerdict;

const ALLOWED: RateLimitVerdict = { allowed: true, retryAfterSec: 0 };

export const createRateLimiter = ({
  limit,
  windowMs,
  maxKeys = 10_000,
}: RateLimiterOptions): RateLimiter => {
  /** key → 윈도우 안에 들어온 요청 시각들 (오래된 것이 앞) */
  const hits = new Map<string, number[]>();

  const dropExpired = (now: number) => {
    for (const [key, times] of hits) {
      const alive = times.filter((time) => now - time < windowMs);
      if (alive.length === 0) hits.delete(key);
      else hits.set(key, alive);
    }
  };

  return (key, now) => {
    const previous = hits.get(key);

    if (previous === undefined && hits.size >= maxKeys) {
      dropExpired(now);
      // 정리해도 자리가 없으면 추적을 포기하고 통과시킨다
      if (hits.size >= maxKeys) return ALLOWED;
    }

    const recent = (previous ?? []).filter((time) => now - time < windowMs);

    if (recent.length >= limit) {
      hits.set(key, recent);
      // 가장 오래된 요청이 윈도우를 벗어나면 한 자리가 생긴다
      const waitMs = windowMs - (now - recent[0]);
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)) };
    }

    recent.push(now);
    hits.set(key, recent);
    return ALLOWED;
  };
};
