"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const net_1 = __importDefault(require("net"));
// macOS 26 (Tahoe) workaround: renderer 프로세스 V8 JIT 불안정 억제
// 주의: main 프로세스 startup crash (ElectronMain C++ 레벨)는 이 플래그로 막을 수 없음
if (process.platform === "darwin") {
    electron_1.app.commandLine.appendSwitch("js-flags", "--no-opt");
}
const isDev = !electron_1.app.isPackaged;
let nextServer = null;
const waitForPort = (port, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
        if (Date.now() > deadline) {
            return reject(new Error(`port ${port} not ready after ${timeoutMs}ms`));
        }
        const socket = net_1.default.createConnection(port, "127.0.0.1");
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
        // asar 밖의 unpacked 경로에 있는 standalone server.js를
        // Electron 내장 Node(ELECTRON_RUN_AS_NODE)로 직접 실행
        const standaloneDir = path_1.default.join(process.resourcesPath, "app.asar.unpacked", ".next", "standalone");
        const serverPath = path_1.default.join(standaloneDir, "server.js");
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
