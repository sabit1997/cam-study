/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  contextBridge,
  ipcRenderer,
  desktopCapturer,
  DesktopCapturerSource,
} from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  send: (channel: string, data: any) => ipcRenderer.send(channel, data),
  on: (channel: string, fn: (data: any) => void) =>
    ipcRenderer.on(channel, (_, args) => fn(args)),
  getSources: (opts: { types: ("window" | "screen")[] }) =>
    desktopCapturer.getSources(opts) as Promise<DesktopCapturerSource[]>,
});
