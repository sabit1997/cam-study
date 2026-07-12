import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  session,
  Streams,
} from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";
import os from "os";
import fs from "fs";
import { spawn } from "child_process";
import net from "net";

// macOS 26 (Tahoe) workaround: V8 JIT 완전 비활성화
// main 프로세스는 LSEnvironment.NODE_OPTIONS=--jitless 로 처리, renderer는 여기서 처리
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("js-flags", "--jitless");
}

const isDev = !app.isPackaged;

let nextServer: ReturnType<typeof spawn> | null = null;
let mainWindow: BrowserWindow | null = null;

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

// Electron은 getDisplayMedia에서 video가 요청됐는데 callback에 video 스트림을
// 못 넘기면(사용자 취소, 소스 없음 등) 예외를 던진다. 이걸 취소하는 공식 API가
// 없어서(https://github.com/electron/electron/issues/47980), 메인 프로세스가
// 죽지 않도록 여기서 잡아서 무시한다.
function safeDisplayMediaCallback(
  callback: (streams: Streams) => void,
  streams: Streams
) {
  try {
    callback(streams);
  } catch (err) {
    console.error("화면 공유 요청 취소/거부 처리 중 에러:", err);
  }
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeReleaseNotes(notes: string | Array<{ note?: string | null }> | null | undefined): string | null {
  if (!notes) return null;
  if (typeof notes === "string") return stripHtml(notes) || null;
  return notes.map((n) => n.note ?? "").filter(Boolean).map(stripHtml).join("\n") || null;
}

function setupAutoUpdater() {
  // 개발 환경에서는 업데이트 체크 생략
  if (isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false; // macOS Squirrel 충돌 방지 (installMacUpdate로 대체)
  autoUpdater.logger = { info: console.log, warn: console.warn, error: console.error, debug: console.debug }; // 상세 진단 로그

  autoUpdater.on("update-available", (info) => {
    cachedUpdateInfo = {
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    };
    mainWindow?.webContents.send("update:available", cachedUpdateInfo);
  });

  autoUpdater.on("download-progress", (progress) => {
    cachedPercent = Math.floor(progress.percent);
    mainWindow?.webContents.send("update:progress", cachedPercent);
  });

  autoUpdater.on("update-downloaded", () => {
    updateDownloaded = true;
    cachedPercent = null;
    mainWindow?.webContents.send("update:downloaded");
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err.message);
    cachedPercent = null;
    mainWindow?.webContents.send("update:error", err.message);
  });

  // 앱 준비 후 5초 뒤 체크 (앱 로딩이 완전히 끝난 후)
  setTimeout(() => autoUpdater.checkForUpdates(), 5000);
}

// 업데이트 상태를 메모리에 보존 — 렌더러가 늦게 마운트돼도 조회 가능
let cachedUpdateInfo: { version: string; releaseNotes: string | null } | null = null;
let cachedPercent: number | null = null;
let updateDownloaded = false;

// 렌더러 마운트 시 놓친 업데이트 상태 조회용 핸들러
ipcMain.handle("update:check-state", () => {
  if (updateDownloaded) return { phase: "ready" };
  if (cachedPercent !== null) return { phase: "downloading", percent: cachedPercent };
  if (cachedUpdateInfo) return { phase: "available", ...cachedUpdateInfo };
  return null;
});

// 렌더러에서 "재시작 후 업데이트 설치" 요청 처리
ipcMain.on("update:restart", () => {
  if (process.platform === "darwin") {
    // Squirrel.Mac은 코드서명 없는 앱의 업데이트를 설치하지 못한다.
    // ZIP을 직접 추출해 앱 번들을 교체하는 셸 스크립트로 우회한다.
    installMacUpdate();
  } else {
    autoUpdater.quitAndInstall(false, true);
  }
});

function installMacUpdate() {
  // electron-updater가 캐시한 ZIP 경로 취득
  const helper = (autoUpdater as unknown as Record<string, unknown>).downloadedUpdateHelper as
    | { file?: string | null; cacheDir?: string }
    | null
    | undefined;

  const zipPath: string =
    helper?.file ??
    path.join(helper?.cacheDir ?? os.tmpdir(), "pending", "update.zip");

  // 진단: 경로 정보 로그
  console.log("[update] helper.file:", helper?.file);
  console.log("[update] helper.cacheDir:", helper?.cacheDir);
  console.log("[update] zipPath:", zipPath);
  console.log("[update] zipExists:", fs.existsSync(zipPath));

  if (!fs.existsSync(zipPath)) {
    dialog.showErrorBox(
      "업데이트 파일 없음",
      `다운로드된 업데이트 파일을 찾을 수 없습니다.\n경로: ${zipPath}\n\n수동으로 최신 버전을 다운로드해 주세요.`
    );
    return;
  }

  // process.execPath = /path/to/앱.app/Contents/MacOS/앱이름
  const appBundlePath = process.execPath.replace(/\/Contents\/MacOS\/[^/]+$/, "");
  const tempDir = path.join(os.tmpdir(), `cam-study-update-${Date.now()}`);
  const scriptPath = path.join(os.tmpdir(), "cam-study-update.sh");
  const logPath = path.join(os.tmpdir(), "cam-study-update.log");

  console.log("[update] appBundlePath:", appBundlePath);
  console.log("[update] scriptPath:", scriptPath);

  // 앱이 완전히 종료된 뒤 실행되는 셸 스크립트
  const script = [
    "#!/bin/bash",
    `exec > "${logPath}" 2>&1`,
    "set -x",
    "sleep 2",
    `TEMP="${tempDir}"`,
    `ZIP="${zipPath}"`,
    `APP="${appBundlePath}"`,
    `mkdir -p "$TEMP"`,
    `ditto -xk "$ZIP" "$TEMP" || unzip -q "$ZIP" -d "$TEMP"`,
    `NEW_APP=$(find "$TEMP" -maxdepth 1 -name "*.app" | head -1)`,
    `echo "NEW_APP=$NEW_APP"`,
    `[ -z "$NEW_APP" ] && echo "ERROR: .app not found in ZIP" && exit 1`,
    `rm -rf "$APP"`,
    `cp -R "$NEW_APP" "$APP"`,
    `rm -rf "$TEMP"`,
    `open "$APP"`,
  ].join("\n");

  try {
    fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  } catch (err) {
    dialog.showErrorBox("업데이트 오류", `스크립트 생성 실패: ${err}`);
    return;
  }

  const child = spawn("bash", [scriptPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  app.quit();
}

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

  win.on("closed", () => {
    mainWindow = null;
  });
  mainWindow = win;

  const url = isDev ? "http://localhost:3000" : "http://localhost:3001";
  await win.loadURL(url);
  setupAutoUpdater();
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

  // macOS 15+에서는 useSystemPicker가 네이티브 선택창을 띄우고 이 핸들러를 건너뛴다.
  // Windows/구버전 macOS/Linux 등 미지원 환경에서는 이 핸들러가 그대로 실행되므로
  // 직접 화면/창 선택 UI(screen-picker 모달)를 렌더러에 띄워 사용자가 고르게 한다.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({
          types: ["screen", "window"],
          thumbnailSize: { width: 320, height: 180 },
        })
        .then((rawSources) => {
          // Windows에서는 스캐너 드라이버 등이 만드는 화면에 보이지 않는 배경
          // 창(예: PfuSshImgProc MainWnd_xxx)도 top-level HWND로 잡혀서 함께
          // 반환된다. 그런 창은 실제로 렌더링되지 않아 썸네일이 비어 있으므로
          // 그걸 기준으로 걸러낸다. 화면(screen) 소스는 그대로 둔다.
          const sources = rawSources.filter(
            (source) =>
              source.id.startsWith("screen:") || !source.thumbnail.isEmpty()
          );

          if (sources.length === 0) {
            safeDisplayMediaCallback(callback, {});
            return;
          }

          if (!mainWindow) {
            safeDisplayMediaCallback(callback, { video: sources[0] });
            return;
          }

          mainWindow.webContents.send(
            "screen-picker:open",
            sources.map((source) => ({
              id: source.id,
              name: source.name,
              thumbnail: source.thumbnail.toDataURL(),
              isScreen: source.id.startsWith("screen:"),
            }))
          );

          // 이전 공유 요청이 취소돼 남아있을 수 있는 리스너를 먼저 제거한 뒤 등록.
          // 제거하지 않으면 취소 → 재시도마다 리스너가 누적되어
          // 오래된 핸들러가 다음 요청의 결과를 가로채는 버그가 발생한다.
          ipcMain.removeAllListeners("screen-picker:result");
          ipcMain.once(
            "screen-picker:result",
            (_event, selectedId: string | null) => {
              const selected = selectedId
                ? sources.find((source) => source.id === selectedId)
                : undefined;
              safeDisplayMediaCallback(
                callback,
                selected ? { video: selected } : {}
              );
            }
          );
        })
        .catch((err) => {
          console.error("desktopCapturer.getSources 에러:", err);
          safeDisplayMediaCallback(callback, {});
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

    if (!fs.existsSync(serverPath)) {
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
