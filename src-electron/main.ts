// main.ts
import { app, BrowserWindow, desktopCapturer, session } from "electron";
import path from "path";
import { spawn } from "child_process";

const isDev = !app.isPackaged;

async function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = isDev ? "http://localhost:3000" : "https://cam-study.vercel.app/";

  await win.loadURL(url);
}

app.whenReady().then(() => {
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
    const next = spawn("npm", ["run", "start:next"], {
      shell: true,
      detached: true,
      stdio: "ignore",
    });
    next.unref();
  }

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
