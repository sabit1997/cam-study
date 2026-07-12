/* eslint-disable @typescript-eslint/no-explicit-any */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  send: (channel: string, data: any) => ipcRenderer.send(channel, data),
  on: (channel: string, fn: (data: any) => void) => {
    const listener = (_: Electron.IpcRendererEvent, args: any) => fn(args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  restartAndUpdate: () => ipcRenderer.send("update:restart"),
  // 마운트 시 놓친 업데이트 상태를 main 프로세스에 조회
  checkUpdateState: () => ipcRenderer.invoke("update:check-state"),
});
