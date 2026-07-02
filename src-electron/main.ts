// main.ts
import { app, BrowserWindow, desktopCapturer, session } from "electron";
import path from "path";
import { spawn } from "child_process";
import net from "net";

// macOS 26 (Tahoe) 호환 workaround: V8 JIT가 Node.js 초기화 중 crash남
app.commandLine.appendSwitch("js-flags", "--no-opt");

const isDev = !app.isPackaged;

const waitForPort = (port: number): Promise<void> =>
  new Promise((resolve) => {
    const check = () => {
      const socket = net.createConnection(port, "localhost");
      socket.on("connect", () => { socket.destroy(); resolve(); });
      socket.on("error", () => { socket.destroy(); setTimeout(check, 500); });
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
    spawn("npm", ["run", "start:next"], {
      shell: true,
      detached: true,
      stdio: "ignore",
      cwd: app.getAppPath(),
    }).unref();
    await waitForPort(3001);
  }

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
