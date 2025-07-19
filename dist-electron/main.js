"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const isDev = process.env.NODE_ENV === "development";
async function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    const url = isDev ? "http://localhost:3000" : "https://cam-study.vercel.app/";
    await win.loadURL(url);
}
electron_1.app.whenReady().then(() => {
    if (!isDev) {
        const next = (0, child_process_1.spawn)("npm", ["run", "start:next"], {
            shell: true,
            detached: true,
            stdio: "ignore",
        });
        next.unref();
    }
    createWindow();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
