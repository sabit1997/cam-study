import type { LocalKV } from "./index";

// Electron preload가 노출한 store IPC 브릿지 위 어댑터.
// window.electronAPI.store가 없으면 사용해선 안 된다 (getLocalKV가 걸러낸다).
export const electronKV: LocalKV = {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    const bridge = window.electronAPI?.store;
    if (!bridge) return undefined;
    return (await bridge.get(key)) as T | undefined;
  },
  async set<T = unknown>(key: string, value: T): Promise<void> {
    const bridge = window.electronAPI?.store;
    if (!bridge) return;
    await bridge.set(key, value as unknown);
  },
  async remove(key: string): Promise<void> {
    const bridge = window.electronAPI?.store;
    if (!bridge) return;
    await bridge.remove(key);
  },
  async keys(prefix?: string): Promise<string[]> {
    const bridge = window.electronAPI?.store;
    if (!bridge) return [];
    return bridge.keys(prefix);
  },
};
