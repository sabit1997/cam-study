import type { LocalKV } from "./index";

// localStorage 위 어댑터. 값은 JSON으로 직렬화한다. 파싱 실패는 undefined 반환으로
// 조용히 처리해 손상된 값이 앱을 죽이지 않도록 한다.
export const browserKV: LocalKV = {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    if (typeof window === "undefined") return undefined;
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  },
  async set<T = unknown>(key: string, value: T): Promise<void> {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
  },
  async remove(key: string): Promise<void> {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
  async keys(prefix?: string): Promise<string[]> {
    if (typeof window === "undefined") return [];
    const out: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k === null) continue;
      if (prefix && !k.startsWith(prefix)) continue;
      out.push(k);
    }
    return out;
  },
};
