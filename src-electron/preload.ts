import { contextBridge, ipcRenderer } from "electron";

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
});
