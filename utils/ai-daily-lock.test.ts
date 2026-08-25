import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDailyLock,
  getDailyLockUntil,
  isDailyLocked,
  setDailyLock,
} from "./ai-daily-lock";

const installLocalStorage = () => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    },
  });
};

describe("ai-daily-lock", () => {
  beforeEach(() => {
    installLocalStorage();
    clearDailyLock();
  });

  it("기본은 UTC 자정까지 락", () => {
    // 2026-08-26T10:00:00Z 기준으로 자정(다음날 00:00:00Z)까지 14시간
    const now = Date.UTC(2026, 7, 26, 10, 0, 0);
    setDailyLock("youtube-search", undefined, now);
    const until = getDailyLockUntil("youtube-search", now);
    expect(until).not.toBeNull();
    const nextMidnight = Date.UTC(2026, 7, 27, 0, 0, 0);
    expect(until).toBe(nextMidnight);
  });

  it("retryAfterSec가 있으면 그걸 존중한다", () => {
    const now = 1_700_000_000_000;
    setDailyLock("interpret", 60, now);
    expect(getDailyLockUntil("interpret", now)).toBe(now + 60_000);
  });

  it("만료 시각 이후는 자동 정리되고 null 반환", () => {
    const now = 1_700_000_000_000;
    setDailyLock("interpret", 60, now);
    expect(isDailyLocked("interpret", now + 61_000)).toBe(false);
    // 다시 물어봐도 그대로 없어야 한다 (정리됐으니)
    expect(getDailyLockUntil("interpret", now + 62_000)).toBeNull();
  });

  it("엔드포인트별로 독립적으로 잠긴다", () => {
    const now = 1_700_000_000_000;
    setDailyLock("interpret", 60, now);
    expect(isDailyLocked("interpret", now)).toBe(true);
    expect(isDailyLocked("youtube-search", now)).toBe(false);
  });

  it("clearDailyLock으로 특정 엔드포인트만 해제", () => {
    const now = 1_700_000_000_000;
    setDailyLock("interpret", 3600, now);
    setDailyLock("youtube-search", 3600, now);
    clearDailyLock("interpret");
    expect(isDailyLocked("interpret", now)).toBe(false);
    expect(isDailyLocked("youtube-search", now)).toBe(true);
  });

  it("clearDailyLock() (인자 없음)은 전체 해제", () => {
    const now = 1_700_000_000_000;
    setDailyLock("interpret", 3600, now);
    setDailyLock("youtube-search", 3600, now);
    clearDailyLock();
    expect(isDailyLocked("interpret", now)).toBe(false);
    expect(isDailyLocked("youtube-search", now)).toBe(false);
  });
});
