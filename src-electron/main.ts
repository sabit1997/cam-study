import { app, BrowserWindow, desktopCapturer, session } from "electron";
import path from "path";
import { spawn } from "child_process";
import net from "net";

// macOS 26 (Tahoe) workaround: renderer 프로세스 V8 JIT 불안정 억제
// 주의: main 프로세스 startup crash (ElectronMain C++ 레벨)는 이 플래그로 막을 수 없음
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("js-flags", "--no-opt");
}

const isDev = !app.isPackaged;

let nextServer: ReturnType<typeof spawn> | null = null;

const waitForPort = (port: number, timeoutMs = 30000): Promise<void> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let done = false;
    const check = () => {
      if (done) return;
      if (Date.now() > deadline) {
        done = true;
        return reject(new Error(`port ${port} not ready after ${timeoutMs}ms`));
      }
      const socket = net.createConnection(port, "127.0.0.1");
      socket.on("connect", () => { done = true; socket.destroy(); resolve(); });
      socket.on("error", () => { socket.destroy(); if (!done) setTimeout(check, 500); });
    };
    check();
  });

async function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  const url = isDev ? "http://localhost:3000" : "http://localhost:3001";
  await win.loadURL(url);
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["*://*.youtube.com/*", "*://*.youtube-nocookie.com/*"] },
    (details, callback) => {
      details.requestHeaders["User-Agent"] =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    }
  );

  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
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
    },
    { useSystemPicker: true }
  );

  if (!isDev) {
    const standaloneDir = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      ".next",
      "standalone"
    );
    const serverPath = path.join(standaloneDir, "server.js");

    if (!require("fs").existsSync(serverPath)) {
      const { dialog } = require("electron");
      dialog.showErrorBox(
        "서버 파일 없음",
        `Next.js 서버를 찾을 수 없습니다.\n${serverPath}`
      );
      app.quit();
      return;
    }

    nextServer = spawn(process.execPath, [serverPath], {
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

    nextServer.on("error", (err) =>
      console.error("Next.js 서버 spawn 실패:", err)
    );

    try {
      await waitForPort(3001, 30000);
    } catch (err) {
      console.error("Next.js 서버 시작 실패:", err);
      const { dialog } = require("electron");
      dialog.showErrorBox(
        "서버 시작 실패",
        "Next.js 서버가 30초 안에 시작되지 않았습니다.\n앱을 다시 시작해 주세요."
      );
      app.quit();
      return;
    }
  }

  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  nextServer?.kill();
  nextServer = null;
});
