import { contextBridge, ipcRenderer } from "electron";
import type { AppLabel, AppPreset, SessionSummary } from "../types/tracking";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  submitScreenPickerResult: (selectedId: string | null) =>
    ipcRenderer.send("screen-picker:result", selectedId),
  onScreenPickerOpen: (fn: (sources: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, sources: unknown) => fn(sources);
    ipcRenderer.on("screen-picker:open", listener);
    return () => ipcRenderer.removeListener("screen-picker:open", listener);
  },
  onCommandPaletteOpen: (fn: () => void) => {
    const listener = () => fn();
    ipcRenderer.on("palette:open", listener);
    return () => ipcRenderer.removeListener("palette:open", listener);
  },
  onUpdateAvailable: (fn: (update: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, update: unknown) => fn(update);
    ipcRenderer.on("update:available", listener);
    return () => ipcRenderer.removeListener("update:available", listener);
  },
  onUpdateProgress: (fn: (percent: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, percent: unknown) => fn(percent);
    ipcRenderer.on("update:progress", listener);
    return () => ipcRenderer.removeListener("update:progress", listener);
  },
  onUpdateDownloaded: (fn: () => void) => {
    ipcRenderer.on("update:downloaded", fn);
    return () => ipcRenderer.removeListener("update:downloaded", fn);
  },
  onUpdateError: (fn: (message: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, message: unknown) => fn(message);
    ipcRenderer.on("update:error", listener);
    return () => ipcRenderer.removeListener("update:error", listener);
  },
  restartAndUpdate: () => ipcRenderer.send("update:restart"),
  // 마운트 시 놓친 업데이트 상태를 main 프로세스에 조회
  checkUpdateState: () => ipcRenderer.invoke("update:check-state"),

  /**
   * 로컬 KV 저장소 (electron-store). 로컬 모드에서 도메인 데이터를 여기에 저장한다.
   * 웹 배포에는 preload가 실행되지 않으므로 이 필드가 없다 — 렌더러는 window.electronAPI.store
   * 유무로 어댑터를 고른다 (utils/local-store).
   */
  store: {
    get: (key: string): Promise<unknown> =>
      ipcRenderer.invoke("store:get", key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke("store:set", key, value),
    remove: (key: string): Promise<void> =>
      ipcRenderer.invoke("store:remove", key),
    keys: (prefix?: string): Promise<string[]> =>
      ipcRenderer.invoke("store:keys", prefix),
  },

  /**
   * 딴짓 감지 트래커.
   *
   * 렌더러가 타이머 시작 시 startSession을, 정지 시 stopSession을 부른다.
   * 세션 요약은 pull 방식으로만 온다 — 실시간 알림은 원칙적으로 보내지 않는다(설계 문서 §2.2).
   */
  tracker: {
    startSession: (): void => ipcRenderer.send("tracker:start"),
    stopSession: (): Promise<SessionSummary | null> =>
      ipcRenderer.invoke("tracker:stop"),
    getLabels: (): Promise<{
      presets: AppPreset[];
      overrides: Record<string, AppLabel>;
    }> => ipcRenderer.invoke("tracker:get-labels"),
    setLabel: (appName: string, label: AppLabel): Promise<void> =>
      ipcRenderer.invoke("tracker:set-label", appName, label),
    removeLabel: (appName: string): Promise<void> =>
      ipcRenderer.invoke("tracker:remove-label", appName),
  },
});
