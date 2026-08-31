// 렌더러에서 로컬 데이터를 저장할 KV 어댑터. Electron이면 preload IPC를 통해
// electron-store로, 웹이면 localStorage로 위임한다. 인터페이스는 async로 통일해서
// 도메인 서비스 코드가 환경을 몰라도 쓸 수 있게 한다.

export interface LocalKV {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

import { browserKV } from "./browser";
import { electronKV } from "./electron";

let cached: LocalKV | null = null;

export function getLocalKV(): LocalKV {
  if (cached) return cached;
  if (
    typeof window !== "undefined" &&
    window.electronAPI &&
    "store" in window.electronAPI &&
    window.electronAPI.store
  ) {
    cached = electronKV;
  } else {
    cached = browserKV;
  }
  return cached;
}

/** 테스트에서 캐시된 어댑터를 초기화하기 위한 헬퍼. */
export const __resetLocalKVForTests = (): void => {
  cached = null;
};
