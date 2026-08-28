// scripts/measure-load-timing.mjs
//
//   node scripts/measure-load-timing.mjs snapshot <before|after>
//   node scripts/measure-load-timing.mjs compare [--runs N]
//
// 결과: bundle-out/timing/{summary.md, raw.json, timing.png}
//
// 번들 크기가 줄었다는 것과 앱이 빨라졌다는 것은 다른 주장이다. 여기서는 후자를
// 재는데, 한 번 재고 끝내면 잡음을 신호로 착각한다. 그래서 반복 실행하고 중앙값과
// 잡음 폭을 함께 낸다. perf-measure.mjs 의 규약(중앙값, IQR, 자가점검표)을 따른다.
//
// 설계에서 신경 쓴 것 세 가지.
//
// 1) 스로틀링. localhost 는 대역폭이 사실상 무한이라 바이트 차이가 시간으로
//    드러나지 않는다. DevTools 의 Fast 3G + CPU 4배를 걸어야 "임계 경로 청크가
//    7개에서 3개로 줄었다" 는 것이 왕복 횟수 차이로 나타난다.
//
// 2) 교차 실행. before 를 N번 돌린 뒤 after 를 N번 돌리면 그 사이 머신 상태
//    변화(열, 다른 프로세스)가 한쪽에만 얹힌다. 회차마다 두 라벨을 번갈아 돌리고
//    순서도 회차마다 뒤집는다.
//
// 3) 스냅샷. before/after 는 다른 브랜치의 빌드다. 브랜치를 옮겨가며 재면 조건이
//    달라지므로, 각 브랜치에서 dist 를 미리 떠두고 한 세션에서 둘을 함께 띄운다.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const ROOT = path.join(import.meta.dirname, "..");
// 인증/비인증은 재는 대상이 다르므로 결과를 섞지 않는다
const OUT_DIR = path.join(
  ROOT,
  "bundle-out",
  process.argv.includes("--authed") ? "timing-authed" : "timing"
);
const LABELS = ["before", "after"];

const MODE = process.argv[2];
const snapDir = (label) => path.join(ROOT, "bundle-out", label, "dist-snapshot");

// ── DevTools "Fast 3G" 와 같은 값 ──
const NET = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps
  uploadThroughput: (750 * 1024) / 8, // 750 Kbps
  latency: 562.5, // ms RTT
};
const CPU_THROTTLE = 4;

const RUNS = Number(
  (process.argv.find((a) => a.startsWith("--runs=")) ?? "").split("=")[1] ?? 7
);
const WARMUP = 1;

/**
 * 인증 모드.
 *
 * 기본(비인증)은 `/` 에서 sign-in 으로 튕기므로 홈 라우트 청크를 아예 받지 않는다.
 * 그래서 `home` 청크만 줄이는 개선은 이 모드에서 잴 수 없다 — 실제로 radix tooltip
 * 제거가 그랬다. 임계 경로(index/react/jsx-runtime)는 1 바이트도 안 변하고 `home` 만
 * 113.6 → 68.6 KB 로 줄었는데, 비인증 측정에서는 차이가 0 으로 나온다.
 *
 * `--authed` 는 로그인 쿠키를 주입하고 `/api/*` 를 가로채 홈까지 진입시킨다. 실제
 * 백엔드에는 요청이 가지 않는다(capture-ui-evidence.mjs 와 같은 방식).
 *
 * API 응답 지연은 고정 40 ms 로 둔다. 스로틀의 RTT(562.5 ms)를 그대로 물리면 창이
 * 뜨는 시각을 API 왕복이 지배해 청크 크기 효과가 묻힌다. 두 라벨에 같은 값이 걸리므로
 * 비교에는 영향이 없고, 절대값을 "실서버 기준 홈 진입 시간" 으로 읽으면 안 된다는
 * 뜻이다.
 */
const AUTHED = process.argv.includes("--authed");
const API_DELAY_MS = 40;

/** 창 목록 픽스처 — capture-ui-evidence.mjs 와 같은 구성 */
const WINDOW_FIXTURE = [
  { id: 9001, type: "todo", x: 420, y: 260, width: 360, height: 480, zIndex: 1, userId: "timing", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: 9002, type: "timer", x: 1180, y: 0, width: 320, height: 380, zIndex: 2, userId: "timing", createdAt: "2026-01-01T00:00:00.000Z" },
];

function mockApi(pathname) {
  if (pathname === "/api/windows") return WINDOW_FIXTURE;
  if (/^\/api\/windows\/\d+\/todos$/.test(pathname)) return [];
  if (pathname === "/api/timer/today") return { totalSeconds: 0, dailyHourGoal: 0, pomoCycles: 0 };
  if (pathname === "/api/timer/goal") return { hour: 0 };
  return {};
}

// ─────────────── 헬퍼 (perf-measure.mjs 와 동일 규약) ───────────────
const sorted = (a) => [...a].filter((x) => typeof x === "number").sort((x, y) => x - y);
const median = (a) => {
  const s = sorted(a);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const iqr = (a) => {
  const s = sorted(a);
  if (s.length < 4) return null;
  return s[Math.floor(s.length * 0.75)] - s[Math.floor(s.length * 0.25)];
};
const noise = (a) => {
  const s = sorted(a);
  return s.length ? s[s.length - 1] - s[0] : null;
};
const ms = (v) => (v == null ? "—" : `${Math.round(v)} ms`);
const kb = (v) => (v == null ? "—" : `${(v / 1024).toFixed(1)} KB`);
const mark = (ok) => (ok ? "✓" : "⚠");
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
function gitDirty() {
  try {
    return (
      execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().length > 0
    );
  } catch {
    return null;
  }
}

// ─────────────── snapshot 모드 ───────────────
function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    // electron-builder 출력물이 dist 안에 생기므로 스냅샷에서 제외한다
    if (e.isDirectory()) {
      if (["win-unpacked", "mac-arm64", "mac", "linux-unpacked"].includes(e.name)) continue;
      copyDir(s, d);
    } else if (e.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

if (MODE === "snapshot") {
  const label = process.argv[3];
  if (!LABELS.includes(label)) {
    console.error("usage: node scripts/measure-load-timing.mjs snapshot <before|after>");
    process.exit(1);
  }
  if (gitDirty()) {
    console.error("⚠ working tree 에 변경이 있습니다. 커밋하거나 stash 한 뒤 스냅샷을 뜨세요.");
    process.exit(1);
  }
  console.log("── vite build ─────────────");
  execFileSync("npm", ["run", "build:web"], { cwd: ROOT, stdio: "inherit", shell: true });

  const dest = snapDir(label);
  copyDir(path.join(ROOT, "dist"), dest);
  fs.writeFileSync(
    path.join(dest, ".meta.json"),
    JSON.stringify({ label, commit: gitHead(), builtAt: new Date().toISOString() }, null, 2)
  );
  console.log(`→ ${path.relative(ROOT, dest)}  (커밋 ${gitHead()})`);
  process.exit(0);
}

if (MODE !== "compare") {
  console.error(
    "usage:\n" +
      "  node scripts/measure-load-timing.mjs snapshot <before|after>\n" +
      "  node scripts/measure-load-timing.mjs compare [--runs=N]"
  );
  process.exit(1);
}

// ─────────────── compare 모드 ───────────────
const meta = {};
for (const label of LABELS) {
  const dir = snapDir(label);
  if (!fs.existsSync(path.join(dir, "index.html"))) {
    console.error(
      `${path.relative(ROOT, dir)} 가 없습니다.\n` +
        `  → 각 브랜치에서 "node scripts/measure-load-timing.mjs snapshot ${label}" 를 먼저 돌리세요.`
    );
    process.exit(1);
  }
  try {
    meta[label] = JSON.parse(fs.readFileSync(path.join(dir, ".meta.json"), "utf8"));
  } catch {
    meta[label] = { label, commit: null };
  }
}
if (meta.before.commit && meta.before.commit === meta.after.commit) {
  console.error(
    `⚠ 두 스냅샷의 커밋이 같습니다 (${meta.before.commit}). 서로 다른 브랜치에서 떴는지 확인하세요.`
  );
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function serve(dir) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(dir, urlPath);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dir, "index.html");
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function runOnce(browser, base) {
  // 컨텍스트마다 캐시가 분리되므로 회차마다 새로 만든다 (DevTools 의 Disable cache 에 해당)
  const context = await browser.newContext(
    // SW 가 fetch 를 가로채면 아래 route 와 겹친다
    AUTHED ? { serviceWorkers: "block" } : {}
  );

  if (AUTHED) {
    // 로그인 상태는 쿠키 하나로 결정된다(stores/user-state.tsx)
    await context.addCookies([
      {
        name: "cam-study-user",
        value: encodeURIComponent(JSON.stringify({ userId: 1, username: "timing" })),
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    await context.route(`${base}/api/**`, async (route) => {
      const url = new URL(route.request().url());
      await new Promise((r) => setTimeout(r, API_DELAY_MS));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockApi(url.pathname)),
      });
    });
    // 창이 실제로 화면에 나타난 시각. load 나 FCP 는 스켈레톤만 그려도 찍히므로
    // "앱을 쓸 수 있게 된 시점" 과 다르다. 홈 라우트 청크 크기가 여기에 드러난다.
    await context.addInitScript(() => {
      window.__windowsReadyAt = null;
      const start = () => {
        if (document.querySelector("[data-window-id]")) {
          window.__windowsReadyAt = performance.now();
          return;
        }
        const observer = new MutationObserver(() => {
          if (window.__windowsReadyAt == null && document.querySelector("[data-window-id]")) {
            window.__windowsReadyAt = performance.now();
            observer.disconnect();
          }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
      } else {
        start();
      }
    });
  }

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");

  /**
   * 전송량은 CDP 로 센다. 리소스 타이밍(performance.getEntriesByType) 은
   * cross-origin 응답의 transferSize 를 보고하지 않는다 — Timing-Allow-Origin 이
   * 없으면 0 이고, 항목 자체가 안 잡히기도 한다.
   *
   * 이걸 모르고 재다가 정반대 결론을 낼 뻔했다. Google Fonts 를 로컬로 옮기는
   * 변경에서 리소스 타이밍은 595.3 → 642.0 KB "증가" 로 보고했는데, CDP 로 세니
   * 658.6 → 657.2 KB 였다. before 의 CDN 폰트 48.8 KB 가 통째로 빠져 있었던 것이다.
   * 외부 요청을 없애는 개선일수록 이 함정에 정확히 걸린다.
   */
  const wire = { bytes: 0, requests: 0, jsRequests: 0 };
  const urlById = new Map();
  cdp.on("Network.requestWillBeSent", (e) => urlById.set(e.requestId, e.request.url));
  cdp.on("Network.loadingFinished", (e) => {
    wire.bytes += e.encodedDataLength;
    wire.requests += 1;
    const url = urlById.get(e.requestId) ?? "";
    if (url.split("?")[0].endsWith(".js")) wire.jsRequests += 1;
  });

  await cdp.send("Network.emulateNetworkConditions", NET);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

  try {
    await page.goto(base + "/", { waitUntil: "load", timeout: 120_000 });
    // FCP 가 기록될 때까지 (스로틀 아래에서는 load 직후에도 아직 없을 수 있다)
    await page
      .waitForFunction(
        () => performance.getEntriesByType("paint").some((p) => p.name === "first-contentful-paint"),
        { timeout: 30_000 }
      )
      .catch(() => {});

    if (AUTHED) {
      await page
        .waitForSelector("[data-window-id]", { timeout: 60_000 })
        .catch(() => {});
    }

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance
        .getEntriesByType("paint")
        .find((p) => p.name === "first-contentful-paint");
      const res = performance.getEntriesByType("resource");
      const js = res.filter((r) => r.name.endsWith(".js"));
      return {
        fcp: fcp ? fcp.startTime : null,
        domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
        load: nav ? nav.loadEventEnd : null,
        windowsReady: window.__windowsReadyAt ?? null,
        jsDecodedBytes: js.reduce((s, r) => s + (r.decodedBodySize || 0), 0),
        // 대조용. cross-origin 이 빠지므로 아래 wire 값과 갈리면 외부 요청이 있다는 뜻이다.
        perfTransferBytes: res.reduce((s, r) => s + (r.transferSize || 0), 0),
      };
    });
    return {
      ...timing,
      requests: wire.requests,
      jsRequests: wire.jsRequests,
      transferBytes: wire.bytes,
    };
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {});
    await context.close();
  }
}

const servers = {};
for (const label of LABELS) {
  servers[label] = await serve(snapDir(label));
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = { before: [], after: [] };

try {
  console.log(
    `Fast 3G (${(NET.downloadThroughput / 1024).toFixed(0)} KB/s, RTT ${NET.latency}ms) · CPU ${CPU_THROTTLE}× · 워밍업 ${WARMUP} · 본 측정 ${RUNS}회`
  );
  console.log(`before ${meta.before.commit} · after ${meta.after.commit}\n`);

  for (let i = 0; i < WARMUP; i++) {
    for (const label of LABELS) {
      await runOnce(browser, `http://127.0.0.1:${servers[label].port}`);
    }
    console.log(`워밍업 ${i + 1}/${WARMUP} (버림)`);
  }

  for (let run = 1; run <= RUNS; run++) {
    // 회차마다 순서를 뒤집어 순서 편향을 없앤다
    const order = run % 2 === 1 ? LABELS : [...LABELS].reverse();
    const line = [];
    for (const label of order) {
      const r = await runOnce(browser, `http://127.0.0.1:${servers[label].port}`);
      results[label].push({ run, ...r });
      line.push(`${label} FCP ${ms(r.fcp)} / load ${ms(r.load)}`);
    }
    console.log(`run ${run}/${RUNS} · ${order.join("→")} · ${line.join(" | ")}`);
  }
} finally {
  await browser.close();
  for (const label of LABELS) await new Promise((r) => servers[label].server.close(r));
}

// ─────────────── 집계 ───────────────
const METRICS = [
  { key: "fcp", name: "FCP (첫 콘텐츠 페인트)", fmt: ms, primary: true },
  { key: "domContentLoaded", name: "DOMContentLoaded", fmt: ms, primary: true },
  { key: "load", name: "load", fmt: ms, primary: true },
  // 창이 실제로 뜬 시각. 라우트 청크 크기가 드러나는 유일한 지표라 인증 모드의 주 지표다.
  ...(AUTHED
    ? [{ key: "windowsReady", name: "창 표시 (홈 진입 완료)", fmt: ms, primary: true }]
    : []),
  { key: "requests", name: "요청 수", fmt: (v) => (v == null ? "—" : String(Math.round(v))) },
  { key: "jsRequests", name: "JS 요청 수", fmt: (v) => (v == null ? "—" : String(Math.round(v))) },
  { key: "transferBytes", name: "전송량", fmt: kb },
];

const stats = {};
for (const m of METRICS) {
  stats[m.key] = {};
  for (const label of LABELS) {
    const vals = results[label].map((r) => r[m.key]);
    stats[m.key][label] = { vals, median: median(vals), iqr: iqr(vals), noise: noise(vals) };
  }
}

const raw = {
  measuredAt: new Date().toISOString(),
  runs: RUNS,
  warmup: WARMUP,
  throttle: { network: NET, cpu: CPU_THROTTLE },
  snapshots: meta,
  results,
  stats,
};
fs.writeFileSync(path.join(OUT_DIR, "raw.json"), JSON.stringify(raw, null, 2));

// ─────────────── 마크다운 ───────────────
let md = `# 첫 로드 시간 비교 (${RUNS}회 중앙값)\n\n`;
md += `- before: \`${meta.before.commit ?? "—"}\` · after: \`${meta.after.commit ?? "—"}\`\n`;
md += `- 측정일: ${raw.measuredAt}\n`;
md += `- 스로틀: Fast 3G (${(NET.downloadThroughput / 1024).toFixed(0)} KB/s · RTT ${NET.latency} ms) · CPU ${CPU_THROTTLE}×\n`;
md += `- 모드: **${AUTHED ? "인증 (홈 라우트까지 진입)" : "비인증 (sign-in 에서 멈춤)"}**\n`;
if (AUTHED) {
  md += `  - 로그인 쿠키를 주입하고 \`/api/*\` 를 고정 ${API_DELAY_MS} ms 지연으로 가로챈다. 실제 백엔드에는 요청이 가지 않는다.\n`;
  md += `  - API 지연을 RTT(${NET.latency} ms)가 아니라 ${API_DELAY_MS} ms 로 둔 이유: 왕복이 창 표시 시각을 지배하면 청크 크기 효과가 묻힌다. 두 라벨에 같은 값이 걸리므로 비교에는 영향이 없지만, 절대값을 실서버 기준 홈 진입 시간으로 읽으면 안 된다.\n`;
} else {
  md += `  - \`/\` 가 sign-in 으로 튕기므로 홈 라우트 청크(\`home\`)는 받지 않는다. 그 청크만 줄이는 개선은 이 모드에서 차이가 0 으로 나온다 — \`--authed\` 로 재야 한다.\n`;
}
md += `- 회차마다 before/after 를 교차 실행하고 순서를 뒤집었다. 컨텍스트를 매번 새로 만들어 캐시를 비웠다.\n\n`;

md += `| 지표 | before 중앙값 | after 중앙값 | 차이 | before 잡음(max−min) | after 잡음 |\n`;
md += `|---|---|---|---|---|---|\n`;
for (const m of METRICS) {
  const b = stats[m.key].before;
  const a = stats[m.key].after;
  const diff =
    b.median != null && a.median != null
      ? `${a.median - b.median > 0 ? "+" : ""}${m.fmt(a.median - b.median)}` +
        (b.median ? ` (${(((a.median - b.median) / b.median) * 100).toFixed(1)} %)` : "")
      : "—";
  md += `| ${m.name} | ${m.fmt(b.median)} | ${m.fmt(a.median)} | ${diff} | ${m.fmt(b.noise)} | ${m.fmt(a.noise)} |\n`;
}

md += `\n## 회차별 원값\n\n`;
for (const m of METRICS.filter((x) => x.primary)) {
  md += `**${m.name}**\n\n`;
  md += `| 라벨 | ${results.before.map((r) => `${r.run}회`).join(" | ")} |\n`;
  md += `|---|${results.before.map(() => "---").join("|")}|\n`;
  for (const label of LABELS) {
    md += `| ${label} | ${results[label].map((r) => m.fmt(r[m.key])).join(" | ")} |\n`;
  }
  md += `\n`;
}

// ─────────────── 자가 점검 ───────────────
const checks = [];
checks.push({
  name: "두 스냅샷이 서로 다른 커밋",
  expected: "다름",
  got: `${meta.before.commit} / ${meta.after.commit}`,
  ok: meta.before.commit !== meta.after.commit,
  hint: "같은 브랜치에서 두 번 스냅샷을 떴을 가능성",
});
checks.push({
  name: `회차 수 (최소 5회)`,
  expected: "≥ 5",
  got: RUNS,
  ok: RUNS >= 5,
  hint: "중앙값이 의미를 갖기엔 부족하다",
});
// 두 계측이 갈리는 폭이 곧 cross-origin 응답의 크기다. 리소스 타이밍은 그것을
// 보고하지 않으므로, 이 줄이 "외부에서 무엇을 얼마나 받고 있는가" 를 드러낸다.
{
  const gap = (label) => {
    const wireMed = median(results[label].map((r) => r.transferBytes));
    const perfMed = median(results[label].map((r) => r.perfTransferBytes));
    return wireMed != null && perfMed != null ? wireMed - perfMed : null;
  };
  const gapBefore = gap("before");
  const gapAfter = gap("after");
  checks.push({
    name: "cross-origin 전송량 (wire − 리소스타이밍)",
    expected: "0 이면 외부 의존 없음",
    got: `before ${kb(gapBefore)} · after ${kb(gapAfter)}`,
    ok: true, // 판정이 아니라 정보 — 외부 의존을 없애는 변경에서 이 값이 줄어든다
    hint: "",
  });
}
// 핵심 점검: 차이가 잡음보다 큰가. 아니면 "빨라졌다" 고 말할 수 없다.
for (const m of METRICS.filter((x) => x.primary)) {
  const b = stats[m.key].before;
  const a = stats[m.key].after;
  const diff = b.median != null && a.median != null ? Math.abs(a.median - b.median) : null;
  const band = Math.max(b.iqr ?? b.noise ?? 0, a.iqr ?? a.noise ?? 0);
  checks.push({
    name: `${m.name} 차이 > 잡음(IQR)`,
    expected: "차이 > IQR",
    got: diff == null ? "—" : `${ms(diff)} vs ${ms(band)}`,
    ok: diff != null && diff > band,
    hint: "차이가 잡음 아래다 — 이 지표로는 빨라졌다고 말할 수 없다",
  });
}
if (AUTHED) {
  // 인증 모드에서는 전송량이 줄어드는 것이 곧 개선이다(라우트 청크가 작아졌다는 뜻).
  // 비인증 모드의 "비슷해야 한다" 규칙을 그대로 쓰면 성공을 실패로 읽는다.
  const b = stats.transferBytes.before.median;
  const a = stats.transferBytes.after.median;
  checks.push({
    name: "전송량 변화 (판정 아님 · 정보)",
    expected: "라우트 청크 감소분만큼",
    got: b && a ? `${kb(b)} → ${kb(a)} (${(((a - b) / b) * 100).toFixed(1)} %)` : "—",
    ok: true,
    hint: "",
  });
  checks.push({
    name: "창이 실제로 떴다",
    expected: "두 라벨 모두 windowsReady 기록",
    got: `${stats.windowsReady.before.vals.filter((v) => v != null).length}/${RUNS} · ${stats.windowsReady.after.vals.filter((v) => v != null).length}/${RUNS}`,
    ok:
      stats.windowsReady.before.vals.every((v) => v != null) &&
      stats.windowsReady.after.vals.every((v) => v != null),
    hint: "쿠키 주입이나 /api mock 이 실패해 sign-in 으로 튕겼을 가능성",
  });
} else {
  checks.push({
    name: "전송량이 두 라벨에서 비슷",
    expected: "±5 %",
    got: `${kb(stats.transferBytes.before.median)} / ${kb(stats.transferBytes.after.median)}`,
    ok:
      stats.transferBytes.before.median && stats.transferBytes.after.median
        ? Math.abs(
            stats.transferBytes.after.median / stats.transferBytes.before.median - 1
          ) < 0.05
        : false,
    hint: "총 전송량이 크게 다르면 임계 경로 효과와 총량 효과가 섞인다",
  });
}

md += `## 자가 점검\n\n| 항목 | 기대 | 관측 | 결과 | 힌트 |\n|---|---|---|---|---|\n`;
for (const c of checks) {
  md += `| ${c.name} | ${c.expected} | ${c.got} | ${mark(c.ok)} | ${c.ok ? "" : c.hint} |\n`;
}

fs.writeFileSync(path.join(OUT_DIR, "summary.md"), md);
console.log("\n" + md);

// ─────────────── 증거 PNG ───────────────
// 형태: 지표별 스트립 도트 플롯. 회차 원값을 전부 찍고 중앙값을 굵은 선으로 표시한다.
// 막대 하나로 중앙값만 보여주면 잡음이 숨는다 — 겹치는지 벌어지는지가 판정의 핵심이라
// 원값을 그대로 노출한다. 계열이 둘이라 범례를 둔다.
async function renderPng() {
  const strips = METRICS.filter((m) => m.primary)
    .map((m) => {
      const all = LABELS.flatMap((l) => stats[m.key][l].vals).filter((v) => typeof v === "number");
      const lo = 0;
      const hi = Math.max(...all) * 1.08;
      const pos = (v) => ((v - lo) / (hi - lo)) * 100;

      const rows = LABELS.map((label) => {
        const st = stats[m.key][label];
        const dots = st.vals
          .filter((v) => typeof v === "number")
          .map(
            (v) =>
              `<span class="dot ${label}" style="left:${pos(v).toFixed(2)}%" title="${Math.round(v)} ms"></span>`
          )
          .join("");
        const medLine =
          st.median == null
            ? ""
            : `<span class="med ${label}" style="left:${pos(st.median).toFixed(2)}%"></span>`;
        return `<div class="row">
            <div class="row-label"><span class="swatch ${label}"></span>${esc(label)}</div>
            <div class="track">${dots}${medLine}</div>
            <div class="row-med">${m.fmt(st.median)}</div>
          </div>`;
      }).join("");

      const b = stats[m.key].before.median;
      const a = stats[m.key].after.median;
      const delta =
        b != null && a != null
          ? `${a - b > 0 ? "+" : "−"}${m.fmt(Math.abs(a - b))} (${(((a - b) / b) * 100).toFixed(1)} %)`
          : "—";
      const band = Math.max(
        stats[m.key].before.iqr ?? stats[m.key].before.noise ?? 0,
        stats[m.key].after.iqr ?? stats[m.key].after.noise ?? 0
      );
      const solid = b != null && a != null && Math.abs(a - b) > band;

      return `<section>
        <div class="head">
          <h2>${esc(m.name)}</h2>
          <div class="delta ${solid ? "solid" : "weak"}">${esc(delta)}${solid ? "" : " · 잡음 아래"}</div>
        </div>
        ${rows}
        <div class="axis"><span>0</span><span>${Math.round(hi)} ms</span></div>
      </section>`;
    })
    .join("");

  const tableRows = METRICS.map((m) => {
    const b = stats[m.key].before;
    const a = stats[m.key].after;
    return `<tr><td>${esc(m.name)}</td><td class="n">${m.fmt(b.median)}</td><td class="n">${m.fmt(a.median)}</td><td class="n">${m.fmt(b.noise)}</td><td class="n">${m.fmt(a.noise)}</td></tr>`;
  }).join("");

  const html = `<!doctype html><meta charset="utf-8">
<style>
  /* 검증된 기준 팔레트 (dataviz references/palette.md) — 계열 2개라 categorical 슬롯 1·2 */
  :root {
    --surface:#fcfcfb; --panel:#f9f9f7; --line:#e6e5e0;
    --ink:#0b0b0b; --ink-2:#52514e; --ink-muted:#82817b;
    --before:#2a78d6; --after:#eb6834; --grid:#eceae4;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --surface:#1a1a19; --panel:#0d0d0d; --line:#35342f;
      --ink:#ffffff; --ink-2:#c3c2b7; --ink-muted:#8f8e85;
      --before:#3987e5; --after:#d95926; --grid:#2b2a26;
    }
  }
  *{box-sizing:border-box}
  body{margin:0;padding:28px 32px;background:var(--surface);color:var(--ink);
       font:13px/1.5 -apple-system,"Segoe UI","Malgun Gothic",sans-serif}
  h1{font-size:17px;margin:0 0 4px;letter-spacing:-.01em}
  .meta{color:var(--ink-muted);font-size:12px;margin-bottom:6px}
  .meta code{color:var(--ink-2)}
  .legend{display:flex;gap:16px;margin:14px 0 20px;font-size:12px;color:var(--ink-2)}
  .legend span.swatch{margin-right:6px}
  .swatch{display:inline-block;width:9px;height:9px;border-radius:50%;vertical-align:middle}
  .swatch.before,.dot.before,.med.before{background:var(--before)}
  .swatch.after,.dot.after,.med.after{background:var(--after)}
  section{margin-bottom:22px}
  .head{display:flex;align-items:baseline;gap:12px;margin-bottom:8px}
  h2{font-size:13px;font-weight:600;margin:0}
  .delta{font-size:12px;font-variant-numeric:tabular-nums}
  .delta.solid{color:var(--ink-2);font-weight:600}
  .delta.weak{color:var(--ink-muted)}
  .row{display:flex;align-items:center;gap:10px;margin:5px 0}
  .row-label{width:74px;color:var(--ink-2);font-size:12px;white-space:nowrap}
  .row-med{width:74px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:var(--ink-2)}
  .track{position:relative;flex:1;height:20px;background:var(--panel);
         border:1px solid var(--line);border-radius:4px}
  /* 원값 점 — 8px 이상, 겹칠 때 표면 링으로 분리 */
  .dot{position:absolute;top:6px;width:8px;height:8px;border-radius:50%;
       margin-left:-4px;box-shadow:0 0 0 2px var(--panel);opacity:.85}
  /* 중앙값 — 굵은 세로선 */
  .med{position:absolute;top:1px;width:2px;height:18px;margin-left:-1px;border-radius:1px}
  .axis{display:flex;justify-content:space-between;color:var(--ink-muted);
        font-size:10px;margin:2px 84px 0}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th{text-align:left;font-weight:550;color:var(--ink-muted);font-size:11px;
     text-transform:uppercase;letter-spacing:.04em;padding:0 10px 7px 0;
     border-bottom:1px solid var(--line)}
  td{padding:6px 10px 6px 0;border-bottom:1px solid var(--line)}
  td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .foot{margin-top:14px;color:var(--ink-muted);font-size:11px}
</style>
<h1>첫 로드 시간 — before / after (${RUNS}회)${AUTHED ? " · 인증 모드" : ""}</h1>
<div class="meta">
  before <code>${esc(meta.before.commit ?? "—")}</code> · after <code>${esc(meta.after.commit ?? "—")}</code> ·
  Fast 3G (${(NET.downloadThroughput / 1024).toFixed(0)} KB/s · RTT ${NET.latency} ms) · CPU ${CPU_THROTTLE}× ·
  회차마다 교차 실행 · 캐시 없음${AUTHED ? ` · 로그인 쿠키 주입, /api mock ${API_DELAY_MS} ms` : " · 비인증(sign-in 에서 멈춤)"}
</div>
<div class="legend">
  <span><span class="swatch before"></span>before</span>
  <span><span class="swatch after"></span>after</span>
  <span style="color:var(--ink-muted)">점 = 회차 원값 · 세로선 = 중앙값</span>
</div>
${strips}
<table>
  <thead><tr><th>지표</th><th class="n">before 중앙값</th><th class="n">after 중앙값</th>
  <th class="n">before 잡음</th><th class="n">after 잡음</th></tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="foot">
  중앙값만 보면 잡음이 숨으므로 회차 원값을 전부 찍었다. 두 계열의 점 구름이 겹치면
  그 지표로는 차이를 주장할 수 없다. "잡음 아래" 표시가 그 판정이다.
</div>`;

  const htmlPath = path.join(OUT_DIR, "timing.html");
  fs.writeFileSync(htmlPath, html);

  const b = await chromium.launch({ channel: "chrome", headless: true });
  const page = await b.newPage({ viewport: { width: 1080, height: 900 } });
  await page.goto("file://" + htmlPath.replace(/\\/g, "/"));
  const dest = path.join(OUT_DIR, "timing.png");
  await page.locator("body").screenshot({ path: dest });
  await b.close();
  console.log(`→ ${path.relative(ROOT, dest)}`);
}

// PNG 는 부록이다. 9회 × 2라벨을 돌린 뒤 Chrome 을 한 번 더 띄우다 실패한 적이
// 있는데(재현되지 않는 일시적 실패였다), 그때 raw.json 과 summary.md 는 이미
// 저장돼 있는데도 프로세스가 0이 아닌 코드로 죽었다. 측정을 다시 돌리게 만들
// 이유가 없다 — 실패를 알리되 결과는 지킨다.
try {
  await renderPng();
} catch (error) {
  console.error(`⚠ PNG 렌더 실패 (수치는 아래 파일에 남아 있다): ${error.message}`);
  console.error(`  다시 구우려면: node scripts/measure-load-timing.mjs compare 를 재실행하거나`);
  console.error(`  ${path.relative(ROOT, path.join(OUT_DIR, "timing.html"))} 를 브라우저에서 열어 캡처하세요.`);
}
console.log(`→ ${path.relative(ROOT, path.join(OUT_DIR, "summary.md"))}`);
