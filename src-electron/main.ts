import { app, BrowserWindow } from "electron";
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

  const url = isDev ? "http://localhost:3000" : "https://cam-study.vercel.app/";

  await win.loadURL(url);
}

app.whenReady().then(() => {
  if (!isDev) {
    // 프로덕션 모드: Next.js 프로덕션 서버 띄우기
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
