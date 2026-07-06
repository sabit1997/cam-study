"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-explicit-any */
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    send: (channel, data) => electron_1.ipcRenderer.send(channel, data),
    on: (channel, fn) => {
        const listener = (_, args) => fn(args);
        electron_1.ipcRenderer.on(channel, listener);
        return () => electron_1.ipcRenderer.removeListener(channel, listener);
    },
    restartAndUpdate: () => electron_1.ipcRenderer.send("update:restart"),
});
