"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
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
let mainWindow = null;
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
// Electron은 getDisplayMedia에서 video가 요청됐는데 callback에 video 스트림을
// 못 넘기면(사용자 취소, 소스 없음 등) 예외를 던진다. 이걸 취소하는 공식 API가
// 없어서(https://github.com/electron/electron/issues/47980), 메인 프로세스가
// 죽지 않도록 여기서 잡아서 무시한다.
function safeDisplayMediaCallback(callback, streams) {
    try {
        callback(streams);
    }
    catch (err) {
        console.error("화면 공유 요청 취소/거부 처리 중 에러:", err);
    }
}
function setupAutoUpdater() {
    // 개발 환경에서는 업데이트 체크 생략
    if (isDev)
        return;
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on("update-available", (info) => {
        mainWindow?.webContents.send("update:available", info.version);
    });
    electron_updater_1.autoUpdater.on("download-progress", (progress) => {
        mainWindow?.webContents.send("update:progress", Math.floor(progress.percent));
    });
    electron_updater_1.autoUpdater.on("update-downloaded", () => {
        mainWindow?.webContents.send("update:downloaded");
    });
    electron_updater_1.autoUpdater.on("error", (err) => {
        console.error("Auto-updater error:", err.message);
    });
    // 앱 준비 후 5초 뒤 체크 (앱 로딩이 완전히 끝난 후)
    setTimeout(() => electron_updater_1.autoUpdater.checkForUpdates(), 5000);
}
// 렌더러에서 "재시작 후 업데이트 설치" 요청 처리
electron_1.ipcMain.on("update:restart", () => {
    electron_updater_1.autoUpdater.quitAndInstall(false, true);
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
    win.on("closed", () => {
        mainWindow = null;
    });
    mainWindow = win;
    const url = isDev ? "http://localhost:3000" : "http://localhost:3001";
    await win.loadURL(url);
    setupAutoUpdater();
}
electron_1.app.whenReady().then(async () => {
    electron_1.session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["*://*.youtube.com/*", "*://*.youtube-nocookie.com/*"] }, (details, callback) => {
        details.requestHeaders["User-Agent"] =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });
    // macOS 15+에서는 useSystemPicker가 네이티브 선택창을 띄우고 이 핸들러를 건너뛴다.
    // Windows/구버전 macOS/Linux 등 미지원 환경에서는 이 핸들러가 그대로 실행되므로
    // 직접 화면/창 선택 UI(screen-picker 모달)를 렌더러에 띄워 사용자가 고르게 한다.
    electron_1.session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
        electron_1.desktopCapturer
            .getSources({
            types: ["screen", "window"],
            thumbnailSize: { width: 320, height: 180 },
        })
            .then((rawSources) => {
            // Windows에서는 스캐너 드라이버 등이 만드는 화면에 보이지 않는 배경
            // 창(예: PfuSshImgProc MainWnd_xxx)도 top-level HWND로 잡혀서 함께
            // 반환된다. 그런 창은 실제로 렌더링되지 않아 썸네일이 비어 있으므로
            // 그걸 기준으로 걸러낸다. 화면(screen) 소스는 그대로 둔다.
            const sources = rawSources.filter((source) => source.id.startsWith("screen:") || !source.thumbnail.isEmpty());
            if (sources.length === 0) {
                safeDisplayMediaCallback(callback, {});
                return;
            }
            if (!mainWindow) {
                safeDisplayMediaCallback(callback, { video: sources[0] });
                return;
            }
            mainWindow.webContents.send("screen-picker:open", sources.map((source) => ({
                id: source.id,
                name: source.name,
                thumbnail: source.thumbnail.toDataURL(),
                isScreen: source.id.startsWith("screen:"),
            })));
            electron_1.ipcMain.once("screen-picker:result", (_event, selectedId) => {
                const selected = selectedId
                    ? sources.find((source) => source.id === selectedId)
                    : undefined;
                safeDisplayMediaCallback(callback, selected ? { video: selected } : {});
            });
        })
            .catch((err) => {
            console.error("desktopCapturer.getSources 에러:", err);
            safeDisplayMediaCallback(callback, {});
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
