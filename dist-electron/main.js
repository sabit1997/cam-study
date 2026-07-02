"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// main.ts
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const net_1 = __importDefault(require("net"));
// macOS 26 (Tahoe) 호환 workaround: V8 JIT가 Node.js 초기화 중 crash남
electron_1.app.commandLine.appendSwitch("js-flags", "--no-opt");
const isDev = !electron_1.app.isPackaged;
const waitForPort = (port) => new Promise((resolve) => {
    const check = () => {
        const socket = net_1.default.createConnection(port, "localhost");
        socket.on("connect", () => { socket.destroy(); resolve(); });
        socket.on("error", () => { socket.destroy(); setTimeout(check, 500); });
    };
    check();
});
async function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
        },
    });
    const url = isDev ? "http://localhost:3000" : "http://localhost:3001";
    await win.loadURL(url);
}
electron_1.app.whenReady().then(async () => {
    electron_1.session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["*://*.youtube.com/*", "*://*.youtube-nocookie.com/*"] }, (details, callback) => {
        details.requestHeaders["User-Agent"] =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });
    electron_1.session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
        electron_1.desktopCapturer
            .getSources({ types: ["screen", "window"] })
            .then((sources) => {
            callback({ video: sources[0] });
        })
            .catch((err) => {
            console.error("desktopCapturer.getSources 에러:", err);
            callback({});
        });
    }, { useSystemPicker: true });
    if (!isDev) {
        (0, child_process_1.spawn)("npm", ["run", "start:next"], {
            shell: true,
            detached: true,
            stdio: "ignore",
            cwd: electron_1.app.getAppPath(),
        }).unref();
        await waitForPort(3001);
    }
    createWindow();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
