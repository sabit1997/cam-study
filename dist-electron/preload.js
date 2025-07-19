"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-explicit-any */
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    send: (channel, data) => electron_1.ipcRenderer.send(channel, data),
    on: (channel, fn) => electron_1.ipcRenderer.on(channel, (_, args) => fn(args)),
    getSources: (opts) => electron_1.desktopCapturer.getSources(opts),
});
