import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  session,
  shell,
  Streams,
} from "electron";
import { autoUpdater } from "electron-updater";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { startExpressServer } from "./express-server";

// macOS 26 (Tahoe) workaround: V8 JIT 완전 비활성화
// main 프로세스는 LSEnvironment.NODE_OPTIONS=--jitless 로 처리, renderer는 여기서 처리
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("js-flags", "--jitless");
}

const isDev = !app.isPackaged;
const DEV_APP_URL = "http://localhost:3000";
const LOCAL_SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

let mainWindow: BrowserWindow | null = null;
let appUrl = isDev ? DEV_APP_URL : "";
let autoUpdaterStarted = false;
let displayMediaRequestPending = false;

function isAppUrl(url: string): boolean {
  if (!appUrl) return false;
  try {
    return new URL(url).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

function openExternalUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") {
      void shell.openExternal(parsed.toString()).catch((err) =>
        console.error("외부 링크 열기 실패:", err)
      );
    }
  } catch {
    // 잘못된 URL은 무시한다.
  }
}

function persistLocalSessionCookies() {
  session.defaultSession.cookies.on("changed", (_event, cookie, _cause, removed) => {
    const domain = cookie.domain?.replace(/^\./, "");
    if (removed || !cookie.session || (domain !== "localhost" && domain !== "127.0.0.1")) {
      return;
    }

    void session.defaultSession.cookies
      .set({
        url: `${cookie.secure ? "https" : "http"}://${domain}${cookie.path ?? "/"}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: Math.floor(Date.now() / 1000) + LOCAL_SESSION_COOKIE_MAX_AGE_SECONDS,
      })
      .catch((err) => console.error("세션 쿠키 저장 실패:", err));
  });
}

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
  if (isDev || autoUpdaterStarted) return;
  autoUpdaterStarted = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = process.platform !== "darwin";
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
    installMacUpdate();
    return;
  }
  autoUpdater.quitAndInstall(false, true);
});

function installMacUpdate() {
  const helper = (autoUpdater as unknown as Record<string, unknown>).downloadedUpdateHelper as
    | { file?: string | null; cacheDir?: string }
    | null
    | undefined;
  const zipPath = helper?.file ?? path.join(helper?.cacheDir ?? os.tmpdir(), "update.zip");

  if (!fs.existsSync(zipPath)) {
    autoUpdater.quitAndInstall(false, true);
    return;
  }

  const appBundlePath = process.execPath.replace(/\/Contents\/MacOS\/[^/]+$/, "");
  const tempDir = path.join(os.tmpdir(), `cam-study-update-${Date.now()}`);
  const scriptPath = path.join(os.tmpdir(), `cam-study-update-${Date.now()}.sh`);
  const script = [
    "#!/bin/bash",
    "sleep 2",
    `TEMP="${tempDir}"`,
    `ZIP="${zipPath}"`,
    `APP="${appBundlePath}"`,
    "mkdir -p \"$TEMP\"",
    "ditto -xk \"$ZIP\" \"$TEMP\" 2>/dev/null || unzip -q \"$ZIP\" -d \"$TEMP\"",
    "NEW_APP=$(find \"$TEMP\" -maxdepth 1 -name \"*.app\" | head -1)",
    "[ -z \"$NEW_APP\" ] && exit 1",
    "rm -rf \"$APP\"",
    "cp -R \"$NEW_APP\" \"$APP\"",
    "rm -rf \"$TEMP\"",
    "open \"$APP\"",
  ].join("\n");

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  const child = spawn("bash", [scriptPath], { detached: true, stdio: "ignore" });
  child.unref();
  app.quit();
}

async function createWindow() {
  if (!appUrl) throw new Error("앱 URL이 초기화되지 않았습니다.");

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

  win.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  win.on("closed", () => {
    mainWindow = null;
  });
  mainWindow = win;

  await win.loadURL(appUrl);
}

app.whenReady().then(async () => {
  persistLocalSessionCookies();
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
    (request, callback) => {
      if (
        !request.frame ||
        !isAppUrl(request.securityOrigin) ||
        !isAppUrl(request.frame.url)
      ) {
        safeDisplayMediaCallback(callback, {});
        return;
      }

      if (displayMediaRequestPending) {
        safeDisplayMediaCallback(callback, {});
        return;
      }
      displayMediaRequestPending = true;

      let requestFinished = false;
      let pickerWebContents: Electron.WebContents | null = null;
      let handleScreenPickerResult:
        | ((event: Electron.IpcMainEvent, selectedId: string | null) => void)
        | null = null;
      const handlePickerDestroyed = () => finishRequest({});
      const finishRequest = (streams: Streams) => {
        if (requestFinished) return;
        requestFinished = true;
        displayMediaRequestPending = false;
        if (handleScreenPickerResult) {
          ipcMain.removeListener("screen-picker:result", handleScreenPickerResult);
          handleScreenPickerResult = null;
        }
        pickerWebContents?.removeListener("destroyed", handlePickerDestroyed);
        pickerWebContents = null;
        safeDisplayMediaCallback(callback, streams);
      };

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
            finishRequest({});
            return;
          }

          if (!mainWindow) {
            finishRequest({ video: sources[0] });
            return;
          }

          pickerWebContents = mainWindow.webContents;
          pickerWebContents.send(
            "screen-picker:open",
            sources.map((source) => ({
              id: source.id,
              name: source.name,
              thumbnail: source.thumbnail.toDataURL(),
              isScreen: source.id.startsWith("screen:"),
            }))
          );
          pickerWebContents.once("destroyed", handlePickerDestroyed);

          handleScreenPickerResult = (
            event: Electron.IpcMainEvent,
            selectedId: string | null
          ) => {
            if (
              event.sender !== mainWindow?.webContents ||
              !event.senderFrame ||
              !isAppUrl(event.senderFrame.url)
            ) {
              return;
            }
            const selected = selectedId
              ? sources.find((source) => source.id === selectedId)
              : undefined;
            finishRequest(selected ? { video: selected } : {});
          };
          ipcMain.on("screen-picker:result", handleScreenPickerResult);
        })
        .catch((err) => {
          console.error("desktopCapturer.getSources 에러:", err);
          finishRequest({});
        });
    },
    { useSystemPicker: true }
  );

  if (!isDev) {
    const staticDir = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "dist"
    );

    try {
      const serverPort = await startExpressServer(staticDir);
      appUrl = `http://localhost:${serverPort}`;
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ""}` : String(err);
      console.error("Express 서버 시작 실패:", msg);
      dialog.showErrorBox(
        "서버 시작 실패",
        `staticDir: ${staticDir}\n\n${msg}`
      );
      app.quit();
      return;
    }
  }

  setupAutoUpdater();
  void createWindow().catch((err) => console.error("창 생성 실패:", err));
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow().catch((err) => console.error("창 재생성 실패:", err));
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
