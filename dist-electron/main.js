"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const net_1 = __importDefault(require("net"));
// macOS 26 (Tahoe) workaround: V8 JIT 완전 비활성화
// main 프로세스는 LSEnvironment.NODE_OPTIONS=--jitless 로 처리, renderer는 여기서 처리
if (process.platform === "darwin") {
    electron_1.app.commandLine.appendSwitch("js-flags", "--jitless");
}
const isDev = !electron_1.app.isPackaged;
let nextServer = null;
const waitForPort = (port, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let done = false;
    const check = () => {
        if (done)
            return;
        if (Date.now() > deadline) {
            done = true;
            return reject(new Error(`port ${port} not ready after ${timeoutMs}ms`));
        }
        const socket = net_1.default.createConnection(port, "127.0.0.1");
        socket.on("connect", () => { done = true; socket.destroy(); resolve(); });
        socket.on("error", () => { socket.destroy(); if (!done)
            setTimeout(check, 500); });
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
            if (sources.length === 0) {
                callback({});
                return;
            }
            callback({ video: sources[0] });
        })
            .catch((err) => {
            console.error("desktopCapturer.getSources 에러:", err);
            callback({});
        });
    }, { useSystemPicker: true });
    if (!isDev) {
        const standaloneDir = path_1.default.join(process.resourcesPath, "app.asar.unpacked", ".next", "standalone");
        const serverPath = path_1.default.join(standaloneDir, "server.js");
        if (!require("fs").existsSync(serverPath)) {
            const { dialog } = require("electron");
            dialog.showErrorBox("서버 파일 없음", `Next.js 서버를 찾을 수 없습니다.\n${serverPath}`);
            electron_1.app.quit();
            return;
        }
        nextServer = (0, child_process_1.spawn)(process.execPath, [serverPath], {
            env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: "1",
                PORT: "3001",
                HOSTNAME: "127.0.0.1",
                NODE_ENV: "production",
            },
            cwd: standaloneDir,
            stdio: "ignore",
        });
        nextServer.on("error", (err) => console.error("Next.js 서버 spawn 실패:", err));
        try {
            await waitForPort(3001, 30000);
        }
        catch (err) {
            console.error("Next.js 서버 시작 실패:", err);
            const { dialog } = require("electron");
            dialog.showErrorBox("서버 시작 실패", "Next.js 서버가 30초 안에 시작되지 않았습니다.\n앱을 다시 시작해 주세요.");
            electron_1.app.quit();
            return;
        }
    }
    createWindow();
});
electron_1.app.on("activate", () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
electron_1.app.on("will-quit", () => {
    nextServer?.kill();
    nextServer = null;
});
