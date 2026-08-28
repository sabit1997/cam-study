// scripts/measure-revisit.mjs
// 사용법: node scripts/measure-revisit.mjs [--runs=N]
// 결과: bundle-out/revisit/{summary.md, raw.json, offline-before.png, offline-after.png}
//
// 서비스 워커가 재방문과 오프라인에서 무엇을 바꾸는지 잰다. measure-load-timing.mjs 는
// 회차마다 컨텍스트를 새로 만들어 캐시를 비우므로(첫 방문 측정) SW 효과가 원리적으로
// 잡히지 않는다. 여기서는 반대로 **같은 컨텍스트를 유지한 채 네 번 방문**한다.
//
//   1차  SW 등록
//   2차  캐시가 채워지는 방문. 1차의 자산 대부분은 SW 가 controller 가 되기 전에
//        이미 로드돼 cache-first 핸들러를 거치지 않는다 — 그래서 아직 반쪽이다.
//   3차  캐시 정착 후의 재방문. **재방문 지표는 여기를 본다.** 2차만 보면 SW 의
//        이득을 절반만 재게 된다(실측: 2차 -1건 vs 3차 -12건).
//   4차  오프라인. 앱 셸(React 마운트)이 뜨는지가 기준이다. API 는 어차피 실패하므로
//        창 목록까지 요구하지 않는다 — 스크립트와 CSS 가 캐시에서 나와 화면이
//        그려지느냐가 쟁점이다.
//
// 정적 서버는 Cache-Control: no-store 를 준다. HTTP 캐시를 배제해 SW 만의 효과를
// 분리하기 위해서다. 실제 배포에서는 HTTP 캐시도 함께 작동하므로 이 수치는 SW 의
// 기여분만 나타낸다.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

const ROOT = path.join(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "bundle-out", "revisit");
const LABELS = ["before", "after"];
const snapDir = (label) => path.join(ROOT, "bundle-out", label, "dist-snapshot");

const RUNS = Number(
  (process.argv.find((a) => a.startsWith("--runs=")) ?? "").split("=")[1] ?? 5
);

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

const kb = (v) => (v == null ? "—" : `${(v / 1024).toFixed(1)} KB`);
const ms = (v) => (v == null ? "—" : `${Math.round(v)} ms`);
const mark = (ok) => (ok ? "✓" : "⚠");
const sorted = (a) => [...a].filter((x) => typeof x === "number").sort((x, y) => x - y);
const median = (a) => {
  const s = sorted(a);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

for (const label of LABELS) {
  if (!fs.existsSync(path.join(snapDir(label), "index.html"))) {
    console.error(
      `${path.relative(ROOT, snapDir(label))} 가 없습니다.\n` +
        `  → 각 브랜치에서 "npm run timing:snapshot ${label}" 를 먼저 돌리세요.`
    );
    process.exit(1);
  }
}

const meta = {};
for (const label of LABELS) {
  try {
    meta[label] = JSON.parse(fs.readFileSync(path.join(snapDir(label), ".meta.json"), "utf8"));
  } catch {
    meta[label] = { label, commit: null };
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * 요청을 **서버에서** 센다.
 *
 * 처음에는 CDP Network.loadingFinished 로 셌는데 before/after 가 똑같이 나왔다.
 * 서비스 워커가 캐시에서 준 응답과 SW 가 네트워크로 다시 나간 요청이 클라이언트
 * 계측에서 잘 구분되지 않고, encodedDataLength 도 0 으로 보고되는 경우가 있다.
 *
 * 서버가 받은 요청은 그런 모호함이 없다. SW 가 캐시에서 주면 여기에 안 온다.
 * 그게 정확히 우리가 재려는 것이다.
 */
function serve(dir, log, state) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);

    // 오프라인 구간은 서버에서 끊는다. context.setOffline 은 페이지의 요청만 막고
    // 서비스 워커가 자기 컨텍스트에서 내는 fetch 는 그대로 통과시켰다 — 실제로
    // 오프라인 구간에 요청이 1~2건 서버에 도달했다. 연결 자체를 끊어야 SW 가 보는
    // 세상이 진짜 오프라인이 된다.
    if (state.offline) {
      log.push({ path: urlPath, bytes: 0, blocked: true });
      req.destroy();
      return;
    }

    let file = path.join(dir, urlPath);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dir, "index.html");
    }
    const body = fs.readFileSync(file);
    log.push({ path: urlPath, bytes: body.length, blocked: false });
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      // HTTP 캐시를 배제해 SW 만의 효과를 분리한다
      "Cache-Control": "no-store",
    });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

/** SW 가 자산을 다 받아 캐시에 넣을 때까지 기다린다. 안 기다리면 2차 방문이 반쪽만 적중한다. */
async function waitForServiceWorker(page) {
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    { timeout: 20_000 }
  ).catch(() => {});
  // controller 가 잡힌 뒤에도 fetch 핸들러가 자산을 넣는 데 시간이 걸린다.
  await page.waitForTimeout(1500);
}

async function runOnce(browser, base, label, runIndex, serverLog, serverState) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.addCookies([
    {
      name: "cam-study-user",
      value: encodeURIComponent(JSON.stringify({ userId: 1, username: "revisit" })),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  // API 는 항상 성공시킨다. 오프라인 구간에서는 아래에서 따로 끊는다.
  let apiOffline = false;
  await context.route(`${base}/api/**`, async (route) => {
    if (apiOffline) return route.abort("internetdisconnected");
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  const page = await context.newPage();

  /** 서버 로그의 현재 위치. 구간 시작 시 기록해두고 끝에서 잘라 쓴다. */
  const mark = () => serverLog.length;
  const since = (from) => serverLog.slice(from);
  const sum = (entries) => entries.reduce((s, e) => s + e.bytes, 0);

  try {
    // ── 1차 방문: SW 등록과 캐시 채우기 ──
    const firstFrom = mark();
    await page.goto(base + "/", { waitUntil: "networkidle", timeout: 60_000 });
    await waitForServiceWorker(page);
    const firstEntries = since(firstFrom);

    const swActive = await page.evaluate(() => navigator.serviceWorker.controller !== null);

    // ── 2차 방문 (온라인) ──
    //
    // 이 방문은 아직 반쪽이다. 1차 방문의 자산 대부분은 SW 가 controller 가 되기
    // 전에 이미 로드돼서 cache-first 핸들러를 거치지 않았고, 따라서 캐시에도 없다.
    // 캐시는 이 2차 방문에서야 채워진다.
    const secondFrom = mark();
    await page.goto(base + "/?revisit=1", { waitUntil: "networkidle", timeout: 60_000 });
    const second = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance
        .getEntriesByType("paint")
        .find((p) => p.name === "first-contentful-paint");
      return { fcp: fcp ? fcp.startTime : null, load: nav ? nav.loadEventEnd : null };
    });
    const secondEntries = since(secondFrom);

    // ── 3차 방문 (온라인) — 캐시가 정착한 뒤 ──
    // 사용자가 앱을 세 번째 여는 경우다. SW 를 쓰는 목적이 실제로 달성되는 지점이라
    // 재방문 지표는 이쪽을 주로 본다.
    const settledFrom = mark();
    await page.goto(base + "/?revisit=2", { waitUntil: "networkidle", timeout: 60_000 });
    const settled = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance
        .getEntriesByType("paint")
        .find((p) => p.name === "first-contentful-paint");
      return { fcp: fcp ? fcp.startTime : null, load: nav ? nav.loadEventEnd : null };
    });
    const settledEntries = since(settledFrom);

    // ── 4차 방문 (오프라인) ──
    // Playwright 의 setOffline 을 쓴다. CDP 로 직접 에뮬레이션하면 Playwright 의
    // 네트워크 스택과 어긋나 실제로는 서버에 요청이 그대로 도달했다.
    apiOffline = true;
    await context.setOffline(true);
    serverState.offline = true;
    const offlineFrom = mark();
    await page.goto(base + "/?offline=1", { waitUntil: "load", timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const offlineEntries = since(offlineFrom);

    const offline = await page.evaluate(() => {
      const root = document.getElementById("root");
      return {
        // React 가 마운트되면 #root 에 자식이 생긴다. 셸이 떴는가의 기준.
        rootMounted: Boolean(root && root.childElementCount > 0),
        // 상단바 로고는 라우트와 무관하게 항상 그려진다.
        hasShellText: document.body.innerText.includes("CAM STUDY"),
        bodyTextLength: document.body.innerText.trim().length,
      };
    });

    const shot =
      runIndex === 1
        ? await page
            .screenshot({ path: path.join(OUT_DIR, `offline-${label}.png`) })
            .then(() => `offline-${label}.png`)
            .catch(() => null)
        : null;

    serverState.offline = false;
    await context.setOffline(false);

    return {
      run: runIndex,
      swActive,
      firstRequests: firstEntries.length,
      firstBytes: sum(firstEntries),
      secondRequests: secondEntries.length,
      secondBytes: sum(secondEntries),
      settledRequests: settledEntries.length,
      settledBytes: sum(settledEntries),
      settledFcp: settled.fcp,
      settledLoad: settled.load,
      // 오프라인 구간에 서버가 실제로 내준 바이트. 0 이어야 오프라인이 성립한다.
      // (연결 시도 자체는 있을 수 있다 — 그건 끊긴다.)
      offlineServedBytes: sum(offlineEntries.filter((e) => !e.blocked)),
      offlineAttempts: offlineEntries.length,
      secondFcp: second.fcp,
      secondLoad: second.load,
      offline,
      shot,
    };
  } finally {
    await context.close();
  }
}

const serverLogs = { before: [], after: [] };
const serverStates = { before: { offline: false }, after: { offline: false } };
const servers = {};
for (const label of LABELS) {
  servers[label] = await serve(snapDir(label), serverLogs[label], serverStates[label]);
}

const browser = await chromium.launch({ channel: "chrome" });
const results = { before: [], after: [] };

try {
  console.log(`재방문·오프라인 측정 · ${RUNS}회 · HTTP 캐시 없음(no-store) — SW 효과만 분리`);
  console.log(`before ${meta.before.commit} · after ${meta.after.commit}\n`);

  for (let run = 1; run <= RUNS; run++) {
    const order = run % 2 === 1 ? LABELS : [...LABELS].reverse();
    for (const label of order) {
      const r = await runOnce(
        browser,
        `http://127.0.0.1:${servers[label].port}`,
        label,
        run,
        serverLogs[label],
        serverStates[label]
      );
      results[label].push(r);
      console.log(
        `run ${run} ${label.padEnd(6)} SW ${r.swActive ? "활성" : "비활성"} · 2차 ${String(r.secondRequests).padStart(2)}건 · 3차 ${String(r.settledRequests).padStart(2)}건 ${kb(r.settledBytes).padStart(9)} · 오프라인 셸 ${r.offline.rootMounted ? "뜸" : "안 뜸"}(서버가 내준 바이트 ${r.offlineServedBytes})`
      );
    }
  }
} finally {
  await browser.close();
  for (const label of LABELS) await new Promise((r) => servers[label].server.close(r));
}

// ─────────────── 리포트 ───────────────
const stat = (label, key) => median(results[label].map((r) => r[key]));
const offlineOk = (label) => results[label].filter((r) => r.offline.rootMounted).length;

const raw = {
  measuredAt: new Date().toISOString(),
  runs: RUNS,
  snapshots: meta,
  results,
};
fs.writeFileSync(path.join(OUT_DIR, "raw.json"), JSON.stringify(raw, null, 2));

let md = `# 재방문·오프라인 (${RUNS}회 중앙값)\n\n`;
md += `- before: \`${meta.before.commit ?? "—"}\` · after: \`${meta.after.commit ?? "—"}\`\n`;
md += `- 측정일: ${raw.measuredAt}\n`;
md += `- 정적 서버가 \`Cache-Control: no-store\` 를 주므로 HTTP 캐시는 작동하지 않는다. 여기 수치는 **서비스 워커만의 기여분**이다. 실제 배포에서는 HTTP 캐시도 함께 듣는다.\n`;
md += `- 1차 방문에서 SW 를 등록하고 자산이 캐시에 들어갈 때까지 기다린 뒤, 같은 컨텍스트에서 2차·3차 방문을 한다.\n\n`;

md += `| 지표 | before | after | 차이 |\n|---|---|---|---|\n`;
const num = (v) => (v == null ? "—" : String(v));
const rows = [
  ["1차 방문 서버 요청", (l) => stat(l, "firstRequests"), num],
  ["2차 방문 서버 요청 (캐시 채우는 중)", (l) => stat(l, "secondRequests"), num],
  ["**3차 방문 서버 요청 (정착)**", (l) => stat(l, "settledRequests"), num],
  ["**3차 방문 서버 전송량 (정착)**", (l) => stat(l, "settledBytes"), kb],
  ["3차 방문 FCP", (l) => stat(l, "settledFcp"), ms],
  ["3차 방문 load", (l) => stat(l, "settledLoad"), ms],
];
for (const [name, get, fmt] of rows) {
  const b = get("before");
  const a = get("after");
  const diff =
    b != null && a != null
      ? `${a - b > 0 ? "+" : ""}${fmt(a - b)}${b ? ` (${(((a - b) / b) * 100).toFixed(1)} %)` : ""}`
      : "—";
  md += `| ${name} | ${fmt(b)} | ${fmt(a)} | ${diff} |\n`;
}
md += `| **오프라인에서 앱 셸이 뜬 횟수** | **${offlineOk("before")}/${RUNS}** | **${offlineOk("after")}/${RUNS}** | |\n`;

md += `\n## 자가 점검\n\n| 항목 | 기대 | 관측 | 결과 | 힌트 |\n|---|---|---|---|---|\n`;
const checks = [
  {
    name: "두 스냅샷이 서로 다른 커밋",
    expected: "다름",
    got: `${meta.before.commit} / ${meta.after.commit}`,
    ok: meta.before.commit !== meta.after.commit,
    hint: "같은 브랜치에서 두 번 스냅샷을 떴을 가능성",
  },
  {
    name: "두 라벨 모두 SW 가 활성화됨",
    expected: `${RUNS}/${RUNS} · ${RUNS}/${RUNS}`,
    got: `${results.before.filter((r) => r.swActive).length}/${RUNS} · ${results.after.filter((r) => r.swActive).length}/${RUNS}`,
    ok:
      results.before.every((r) => r.swActive) && results.after.every((r) => r.swActive),
    hint: "SW 등록 대기가 부족하거나 등록 조건(window.electronAPI 부재)이 안 맞는다",
  },
  {
    name: "1차 방문 전송량은 두 라벨이 비슷",
    expected: "±10 %",
    got: `${kb(stat("before", "firstBytes"))} / ${kb(stat("after", "firstBytes"))}`,
    ok: (() => {
      const b = stat("before", "firstBytes");
      const a = stat("after", "firstBytes");
      return b && a ? Math.abs(a / b - 1) < 0.1 : false;
    })(),
    hint: "첫 방문이 다르면 재방문 차이를 SW 덕으로 돌릴 수 없다",
  },
  {
    // 오프라인 구간에 서버 요청이 도달했다면 오프라인이 안 걸린 것이고,
    // "오프라인에서도 떴다" 는 결론이 통째로 무효가 된다.
    name: "오프라인 구간에 서버가 내준 바이트 0",
    expected: "0 · 0",
    got: `${stat("before", "offlineServedBytes")} · ${stat("after", "offlineServedBytes")} (연결 시도 ${stat("before", "offlineAttempts")} · ${stat("after", "offlineAttempts")})`,
    ok:
      results.before.every((r) => r.offlineServedBytes === 0) &&
      results.after.every((r) => r.offlineServedBytes === 0),
    hint: "오프라인이 안 걸렸다 — 오프라인 결과를 신뢰할 수 없다",
  },
];
for (const c of checks) {
  md += `| ${c.name} | ${c.expected} | ${c.got} | ${mark(c.ok)} | ${c.ok ? "" : c.hint} |\n`;
}

md += `\n오프라인 화면은 \`offline-before.png\` · \`offline-after.png\` 에 있다.\n`;

fs.writeFileSync(path.join(OUT_DIR, "summary.md"), md);
console.log("\n" + md);
console.log(`→ ${path.relative(ROOT, path.join(OUT_DIR, "summary.md"))}`);
