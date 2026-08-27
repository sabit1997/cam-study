// scripts/capture-devtools.mjs
// 사용법: node scripts/capture-devtools.mjs <before|after>
// 결과: bundle-out/<label>/devtools-network.png
//
// 실제 Chrome DevTools Network 패널을 찍는다. 내가 만든 표가 아니라 도구 자신의 화면이다.
//
// 여기까지 오는 데 함정이 세 개 있었다. 그대로 적어둔다.
//
// 1) Playwright 로 띄우면 DevTools 가 안 열린다.
//    Chrome 은 디버거를 하나만 허용한다. Playwright 가 CDP 로 붙어 있으면
//    --auto-open-devtools-for-tabs 도 F12 도 무시된다. 그래서 이 스크립트는
//    Playwright 를 쓰지 않고 chrome.exe 를 직접 띄운다.
//
// 2) 화면 영역 캡처(CopyFromScreen)는 위험하다.
//    창을 포그라운드로 올리는 데 실패하면 그 자리에 있던 다른 창이 찍힌다.
//    실제로 무관한 앱 창이 캡처된 적이 있다. 그래서 PrintWindow 로 바꿨다 —
//    창 자신의 버퍼를 렌더하므로 다른 창의 내용은 구조적으로 들어올 수 없고,
//    포그라운드로 올릴 필요도 없다.
//
// 3) DevTools 가 붙기 전에 요청이 지나가면 Network 패널이 빈다.
//    입력 자동화(Ctrl+R)는 창 포커스가 필요해 다시 (2)의 문제로 돌아간다.
//    그래서 Chrome 을 /__boot 로 띄운다. 이 페이지가 잠시 뒤 스스로 "/" 로
//    이동하므로, 그때는 DevTools 가 이미 기록 중이다. 포커스가 필요 없다.
//
// 알려진 한계: PrintWindow 는 Chrome 의 GPU 합성 페이지 영역을 못 뜬다. 페이지
// 본문은 흰색으로 나온다. 이 스크립트의 목적은 Network 패널이므로 문제는 없고,
// 앱 화면은 capture-bundle-evidence.mjs 가 app.png 로 따로 찍는다.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { execFileSync, spawn } from "node:child_process";

const ROOT = path.join(import.meta.dirname, "..");

const LABEL = process.argv[2];
if (!LABEL) {
  console.error("usage: node scripts/capture-devtools.mjs <before|after>");
  process.exit(1);
}

const OUT_DIR = path.join(ROOT, "bundle-out", LABEL);
fs.mkdirSync(OUT_DIR, { recursive: true });

const DIST = path.join(ROOT, "dist");

// 기본적으로 직접 빌드한다.
//
// 안 그러면 dist/ 에 다른 브랜치의 빌드가 남아 있을 때 라벨과 내용이 어긋난다.
// 실제로 before 로 찍었는데 zod-lazy 브랜치의 command-palette 청크가 찍혀 나왔다.
// 증거 자료가 조용히 거짓말하는 것이 가장 나쁘므로 여기서 막는다.
if (!process.argv.includes("--no-build")) {
  console.log("── vite build ─────────────");
  execFileSync("npm", ["run", "build:web"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
}

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error(`dist/index.html 이 없습니다. npm run build:web 을 먼저 돌리세요.`);
  process.exit(1);
}

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error("Chrome 또는 Edge 를 찾지 못했습니다.");
  process.exit(1);
}

// DevTools 가 붙을 시간(ms). 이 뒤에 /__boot 가 "/" 로 이동한다.
const BOOT_DELAY = 4500;
const SETTLE = 3500; // 이동 후 요청이 다 끝나기까지

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ps(script) {
  // -Command 로 넘기면 UTF-16 으로 전달되어 한글이 안 깨진다.
  // (.ps1 파일로 두면 PowerShell 5.1 이 ANSI 로 읽어 깨진다)
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  });
}

// ─────────────── 프로필 시드 ───────────────
// Chrome 은 DevTools 설정을 Preferences 안 devtools.preferences 에 "문자열로
// 인코딩된 JSON" 으로 저장한다. 그래서 값에 따옴표가 한 겹 더 붙는다.
function seedProfile(dir) {
  const defaultDir = path.join(dir, "Default");
  fs.mkdirSync(defaultDir, { recursive: true });
  fs.writeFileSync(
    path.join(defaultDir, "Preferences"),
    JSON.stringify({
      devtools: {
        preferences: {
          "panel-selected-tab": '"network"',
          currentDockState: '"bottom"',
          "cache-disabled": "true",
          "network-log-large-rows": "false",
          "network-color-code-resource-types": "true",
          // DevTools 를 창 높이의 대부분으로 늘린다. 기본 크기로는 요청이 4줄만
          // 보여서 증거로 쓸 수 없다. 키 이름이 DevTools 버전마다 갈려 둘 다 넣는다.
          "inspector-view.split-view-state": '{"horizontal":{"size":700}}',
          "InspectorView.splitViewState": '{"horizontal":{"size":700}}',
          // DevTools 를 한국어로. 안 그러면 "DevTools is now available in Korean"
          // 안내 배너가 패널 위 한 줄을 잡아먹는다.
          language: '"ko"',
        },
      },
    })
  );
}

// ─────────────── 서버 ───────────────
function serve() {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);

    // DevTools 가 붙을 시간을 벌어주는 부트 페이지.
    // 이 페이지의 요청은 Network 패널에 남지 않는다(아직 안 붙었으므로).
    if (urlPath === "/__boot") {
      res.writeHead(200, { "Content-Type": types[".html"], "Cache-Control": "no-store" });
      res.end(`<!doctype html><meta charset="utf-8"><title>준비 중</title>
<body style="font:14px system-ui;padding:40px;color:#555">
DevTools 가 붙기를 기다립니다… 잠시 뒤 앱을 로드합니다.
<script>setTimeout(function(){ location.replace("/"); }, ${BOOT_DELAY});</script>`);
      return;
    }

    let file = path.join(DIST, urlPath);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, "index.html");
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

// ─────────────── 캡처 ───────────────
// PrintWindow(PW_RENDERFULLCONTENT). 창 밖은 담기지 않는다.
// 이 화면은 2x 스케일링이라 SetProcessDPIAware() 를 먼저 불러야 GetWindowRect 가
// 물리 픽셀을 준다. 안 부르면 좌상단 1/4 만 확대돼 나온다.
function captureWindow(pid, dest) {
  return ps(`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PW {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
[void][PW]::SetProcessDPIAware()

$procs = @(Get-Process -Id ${pid} -ErrorAction SilentlyContinue)
$procs += Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" |
          ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
$t = $procs | Where-Object { $_ -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $t) { throw "창을 찾지 못했습니다 (pid ${pid})" }
$h = $t.MainWindowHandle

$r = New-Object PW+RECT
[void][PW]::GetWindowRect($h, [ref]$r)
$w = $r.R - $r.L; $hh = $r.B - $r.T
if ($w -le 0 -or $hh -le 0) { throw "창 크기를 읽지 못했습니다" }

$bmp = New-Object System.Drawing.Bitmap $w, $hh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [PW]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc)
if (-not $ok) { throw "PrintWindow 실패" }
$bmp.Save('${dest.replace(/\\/g, "\\\\")}', [System.Drawing.Imaging.ImageFormat]::Png)

# 전부 검게 나오는 것이 PrintWindow 실패의 대표 증상이므로 표본 검사한다
$sample = 0; $nonBlack = 0
for ($x = 10; $x -lt $w; $x += 97) {
  for ($y = 10; $y -lt $hh; $y += 89) {
    $c = $bmp.GetPixel($x, $y); $sample++
    if (($c.R + $c.G + $c.B) -gt 30) { $nonBlack++ }
  }
}
$g.Dispose(); $bmp.Dispose()
"$w x $hh | 표본 $sample 중 비검정 $nonBlack"
`).trim();
}

// ─────────────── 실행 ───────────────
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "camstudy-devtools-"));
seedProfile(userDataDir);

const { server, port } = await serve();
const base = `http://127.0.0.1:${port}`;

const child = spawn(
  CHROME,
  [
    `--user-data-dir=${userDataDir}`,
    "--auto-open-devtools-for-tabs",
    "--window-size=1400,880",
    "--window-position=8,8",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate",
    "--new-window",
    `${base}/__boot`,
  ],
  { detached: false, stdio: "ignore" }
);

try {
  console.log(`Chrome pid ${child.pid} · ${base}`);
  console.log(`DevTools 대기 ${BOOT_DELAY}ms → 앱 로드 → 정착 ${SETTLE}ms`);
  await sleep(BOOT_DELAY + SETTLE);

  const dest = path.join(OUT_DIR, "devtools-network.png");
  const info = captureWindow(child.pid, dest);
  console.log(`→ ${path.relative(ROOT, dest)}  (${info})`);
} finally {
  try {
    ps(`Stop-Process -Id ${child.pid} -Force -ErrorAction SilentlyContinue`);
  } catch {
    /* 이미 종료됨 */
  }
  await sleep(700);
  await new Promise((r) => server.close(r));
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
