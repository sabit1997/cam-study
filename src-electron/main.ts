// main.ts
import { app, BrowserWindow, desktopCapturer, session } from "electron";
import path from "path";
import { spawn } from "child_process";

const isDev = process.env.NODE_ENV === "development";

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

  const url = isDev
    ? "https://localhost:3000"
    : "https://cam-study.vercel.app/";

  await win.loadURL(url);
}

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
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
