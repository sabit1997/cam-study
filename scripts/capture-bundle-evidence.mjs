// scripts/capture-bundle-evidence.mjs
// 사용법: node scripts/capture-bundle-evidence.mjs <before|after>
// 결과: bundle-out/<label>/treemap.png, network.png, network.json
//
// measure-bundle.mjs 가 숫자를 낸다면 이 스크립트는 그 숫자의 증거를 굽는다.
//
//   treemap.png  rollup-plugin-visualizer 트리맵. 어느 패키지가 어느 청크 안에
//                들어있는지 눈으로 확인할 수 있다. zod 가 index 안에 있는지
//                lazy 청크로 옮겨갔는지가 여기서 바로 보인다.
//   network.png  실제 브라우저가 첫 화면에 받는 요청 목록. DevTools Network 패널에
//                해당하며, "초기 로드 세트" 주장의 1차 증거다.
//
// 브라우저는 시스템 Chrome 을 쓴다(channel: "chrome"). Playwright 전용 Chromium 을
// 내려받지 않으려는 의도적 선택이다 — 이 저장소는 이미 Chrome 이 깔린 환경에서 돈다.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

const ROOT = path.join(import.meta.dirname, "..");

const LABEL = process.argv[2];
if (!LABEL) {
  console.error("usage: node scripts/capture-bundle-evidence.mjs <before|after>");
  process.exit(1);
}

const OUT_DIR = path.join(ROOT, "bundle-out", LABEL);
fs.mkdirSync(OUT_DIR, { recursive: true });

const DIST = path.join(ROOT, "dist");
if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("dist/index.html 이 없습니다. npm run bundle:" + LABEL + " 를 먼저 돌리세요.");
  process.exit(1);
}

const kb = (b) => (b / 1024).toFixed(1);
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ─────────────── 기준 커밋 ───────────────
let head = "(unknown)";
let dirty = false;
try {
  const { execSync } = await import("node:child_process");
  head = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  dirty = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
} catch {
  /* git 없어도 캡처는 계속 */
}

const browser = await chromium.launch({ channel: "chrome" });

// ─────────────── 1. 트리맵 ───────────────
async function captureTreemap() {
  const src = path.join(ROOT, "dist-analyze", "treemap.html");
  if (!fs.existsSync(src)) {
    console.log("⚠ dist-analyze/treemap.html 없음 — BUNDLE_ANALYZE=1 빌드가 필요합니다. 건너뜀");
    return null;
  }
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto("file://" + src.replace(/\\/g, "/"));
  // 트리맵은 SVG 를 비동기로 그린다. 사각형이 실제로 생길 때까지 기다린다.
  await page.waitForSelector("svg", { timeout: 15_000 });
  await page.waitForFunction(() => document.querySelectorAll("svg rect").length > 20, {
    timeout: 15_000,
  });
  const dest = path.join(OUT_DIR, "treemap.png");
  await page.screenshot({ path: dest, fullPage: false });
  await page.close();
  console.log("→ " + path.relative(ROOT, dest));
  return dest;
}

// ─────────────── 2. 실제 첫 로드 네트워크 ───────────────
function serveDist() {
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
    let file = path.join(DIST, urlPath);
    // SPA: 정적 파일이 아니면 index.html 로 (vercel.json rewrites 와 같은 동작)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, "index.html");
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
      // 초기 로드 증거이므로 캐시를 완전히 끈다 (DevTools 의 Disable cache 에 해당)
      "Cache-Control": "no-store",
    });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function captureNetwork() {
  const { server, port } = await serveDist();
  const base = `http://127.0.0.1:${port}`;
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  const requests = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (!url.startsWith(base)) return; // 외부(백엔드·YouTube) 요청은 제외
    const name = url.slice(base.length) || "/";
    let size = null;
    try {
      size = (await res.body()).length;
    } catch {
      /* 리다이렉트 등 본문 없는 응답 */
    }
    requests.push({
      name,
      status: res.status(),
      type: (res.headers()["content-type"] ?? "").split(";")[0],
      size,
    });
  });

  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.close();
  await new Promise((r) => server.close(r));

  const js = requests.filter((r) => r.name.endsWith(".js"));
  const totalJs = js.reduce((s, r) => s + (r.size ?? 0), 0);
  const totalAll = requests.reduce((s, r) => s + (r.size ?? 0), 0);

  fs.writeFileSync(
    path.join(OUT_DIR, "network.json"),
    JSON.stringify({ label: LABEL, commit: head, dirty, base, requests }, null, 2)
  );

  return { requests, js, totalJs, totalAll };
}

// ─────────────── 3. 네트워크 리포트 렌더 → PNG ───────────────
async function renderNetworkPng(net) {
  const maxSize = Math.max(...net.requests.map((r) => r.size ?? 0), 1);

  const rows = net.requests
    .slice()
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .map((r) => {
      const pct = ((r.size ?? 0) / maxSize) * 100;
      return `<tr>
        <td class="name">${esc(r.name)}</td>
        <td class="num">${r.status}</td>
        <td class="type">${esc(r.type || "—")}</td>
        <td class="num">${r.size == null ? "—" : kb(r.size) + " KB"}</td>
        <td class="bar"><span style="width:${pct.toFixed(1)}%"></span></td>
      </tr>`;
    })
    .join("");

  // 스탯 타일 — 헤드라인 숫자는 차트가 아니라 타일이 맞다.
  const tile = (label, value, sub) =>
    `<div class="tile"><div class="tile-label">${esc(label)}</div>
     <div class="tile-value">${esc(value)}</div>
     <div class="tile-sub">${esc(sub)}</div></div>`;

  const html = `<!doctype html><meta charset="utf-8">
<style>
  /* 검증된 기준 팔레트 사용 (dataviz references/palette.md).
     막대는 크기(magnitude) 하나만 나타내는 단일 계열이라 색으로 분류하지 않는다 —
     JS/CSS 구분은 "타입" 열이 글자로 이미 하고 있다. 그래서 범례도 없다.
     --bar 는 sequential 기본 색조(blue 450). 검증 결과 light/dark 모두 3:1 통과. */
  :root {
    --surface: #fcfcfb; --panel: #f9f9f7; --line: #e6e5e0;
    --ink: #0b0b0b; --ink-2: #52514e; --ink-muted: #82817b;
    --bar: #2a78d6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --surface: #1a1a19; --panel: #0d0d0d; --line: #35342f;
      --ink: #ffffff; --ink-2: #c3c2b7; --ink-muted: #8f8e85;
      --bar: #3987e5;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 32px; background: var(--surface); color: var(--ink);
    font: 13px/1.5 -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  }
  h1 { font-size: 17px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .meta { color: var(--ink-muted); font-size: 12px; margin-bottom: 20px; }
  .meta code { color: var(--ink-2); }
  .tiles { display: flex; gap: 12px; margin-bottom: 22px; }
  .tile { flex: 1; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
  .tile-label { color: var(--ink-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .tile-value { font-size: 24px; font-weight: 650; margin: 3px 0 1px; letter-spacing: -0.02em; }
  .tile-sub { color: var(--ink-2); font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 550; color: var(--ink-muted); font-size: 11px;
       text-transform: uppercase; letter-spacing: 0.04em; padding: 0 10px 7px 0;
       border-bottom: 1px solid var(--line); }
  td { padding: 6px 10px 6px 0; border-bottom: 1px solid var(--line); vertical-align: middle; }
  .name { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12px; }
  .type { color: var(--ink-muted); font-size: 11px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .bar { width: 34%; padding-right: 0; }
  /* 얇은 마크 · 베이스라인에 고정 · 데이터 끝만 4px 라운드 */
  .bar span { display: block; height: 9px; border-radius: 0 4px 4px 0; background: var(--bar); }
  .foot { margin-top: 16px; color: var(--ink-muted); font-size: 11px; }
</style>
<h1>첫 로드 네트워크 — ${esc(LABEL)}</h1>
<div class="meta">
  기준 커밋 <code>${esc(head)}</code>${dirty ? " <b>(working tree 변경 있음)</b>" : ""} ·
  캐시 없음(<code>Cache-Control: no-store</code>) · 로컬 정적 서버 · 시스템 Chrome
</div>
<div class="tiles">
  ${tile("JS 요청", String(net.js.length) + "개", "브라우저가 받은 .js 파일 수")}
  ${tile("JS 전송량", kb(net.totalJs) + " KB", "raw (압축 전)")}
  ${tile("전체 전송량", kb(net.totalAll) + " KB", "JS + CSS + HTML + 아이콘")}
</div>
<table>
  <thead><tr>
    <th>요청</th><th class="num">상태</th><th>타입</th><th class="num">크기</th><th>비중</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="foot">
  막대는 가장 큰 응답을 100 %로 둔 상대 크기다. 크기는 응답 본문 raw 바이트(압축 전).
  비인증 상태의 첫 로드이므로 라우트 청크는 sign-in 경로가 잡힌다.
</div>`;

  const htmlPath = path.join(OUT_DIR, "network.html");
  fs.writeFileSync(htmlPath, html);

  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  await page.goto("file://" + htmlPath.replace(/\\/g, "/"));
  const dest = path.join(OUT_DIR, "network.png");
  // fullPage 는 뷰포트 높이까지 채워 아래에 빈 공간을 남긴다. body 로 잘라낸다.
  await page.locator("body").screenshot({ path: dest });
  await page.close();
  console.log("→ " + path.relative(ROOT, dest));
  return dest;
}

// ─────────────── 실행 ───────────────
try {
  await captureTreemap();
  const net = await captureNetwork();
  await renderNetworkPng(net);

  console.log("");
  console.log(`JS 요청 ${net.js.length}개 · ${kb(net.totalJs)} KB · 전체 ${kb(net.totalAll)} KB`);
  if (dirty) {
    console.log("⚠ working tree 에 변경이 있습니다 — 증거로 인용하기 전에 커밋하세요.");
  }
} finally {
  await browser.close();
}
