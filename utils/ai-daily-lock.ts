/**
 * Gemini의 daily quota 소진 상태를 브라우저에 기억해 두는 락.
 *
 * ## 왜 필요한가
 * 서버가 429 응답에 `reason: "daily"`를 실어 보내지만, 클라이언트가 그걸 잊고
 * 매번 다시 요청하면 사용자는 매번 429를 본다. quota는 UTC 자정에 리셋되므로,
 * 그전까지는 API 호출을 시도하지 않고 즉시 폴백 경로를 태우는 게 사용자에게 정확하다.
 *
 * ## 왜 클라이언트에 두나
 * 서버 사이드 KV 없이도 같은 브라우저는 조용해진다. 다른 브라우저·다른 기기는
 * 자기 몫으로 한 번씩 429를 겪지만, "내 눈에 뜬 429가 사라진다"가 이 유틸의 목표다.
 *
 * ## 언제 자동 해제되나
 * - 저장 시 계산된 만료 시각(기본 UTC 자정) 이후
 * - 서버가 retryAfterSec를 함께 준 경우엔 그 값을 존중 — daily 응답의 retryDelay가
 *   "자정까지 남은 초"로 오는 경우가 흔해 자연스레 맞아떨어진다.
 * - `clearDailyLock`으로 명시 해제 (설정·테스트용)
 */

const STORAGE_KEY = "ai-daily-lock:v1";

/** 락 대상 엔드포인트. reason 라벨과 무관하게 endpoint 단위로 관리한다. */
export type LockableEndpoint = "interpret" | "youtube-search";

interface LockShape {
  [endpoint: string]: number; // expiresAt (ms since epoch)
}

const hasStorage = (): boolean =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readAll = (): LockShape => {
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as LockShape) : {};
  } catch {
    return {};
  }
};

const writeAll = (shape: LockShape): void => {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch {
    // ignore
  }
};

/** 다음 UTC 자정까지의 밀리초. 서버가 대기 시간을 안 준 경우 기본값. */
const millisUntilUtcMidnight = (now: number): number => {
  const d = new Date(now);
  // 다음 날 00:00:00 UTC
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return next - now;
};

export const setDailyLock = (
  endpoint: LockableEndpoint,
  retryAfterSec?: number,
  now: number = Date.now()
): void => {
  const waitMs =
    retryAfterSec && retryAfterSec > 0
      ? retryAfterSec * 1000
      : millisUntilUtcMidnight(now);
  const shape = readAll();
  shape[endpoint] = now + waitMs;
  writeAll(shape);
};

/**
 * 락이 유효하면 만료 시각(ms)을 반환. 유효하지 않거나 없으면 null.
 * 만료된 락은 이 호출 안에서 자동 정리한다.
 */
export const getDailyLockUntil = (
  endpoint: LockableEndpoint,
  now: number = Date.now()
): number | null => {
  const shape = readAll();
  const expiresAt = shape[endpoint];
  if (typeof expiresAt !== "number") return null;
  if (expiresAt <= now) {
    // 만료됐으니 조용히 제거
    delete shape[endpoint];
    writeAll(shape);
    return null;
  }
  return expiresAt;
};

export const isDailyLocked = (
  endpoint: LockableEndpoint,
  now: number = Date.now()
): boolean => getDailyLockUntil(endpoint, now) !== null;

export const clearDailyLock = (endpoint?: LockableEndpoint): void => {
  if (!endpoint) {
    if (!hasStorage()) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return;
  }
  const shape = readAll();
  delete shape[endpoint];
  writeAll(shape);
};
