#!/usr/bin/env node
/**
 * 사람 손이 들어가지 않는 웹 번들 경량화 측정 파이프라인.
 *
 * 사용법:
 *   node scripts/perf-measure-bundle.mjs before   # 변경 전 스냅샷
 *   node scripts/perf-measure-bundle.mjs after    # 변경 후 스냅샷
 *   node scripts/perf-measure-bundle.mjs diff     # 두 스냅샷 비교 → perf-out/bundle/diff.md
 *
 * 각 라벨 실행은 다음을 자동으로 수행한다.
 *   1. dist/ 정리 → vite build 재실행
 *   2. dist 안 청크별 크기 · gzip 크기 · 진입/최대 청크 산출
 *   3. vite preview 기동 후 Playwright 로 홈 로딩
 *      - 네트워크 로그 (URL, transferSize, mime, status) 캡처
 *      - 콘솔/pageerror 캡처
 *      - HAR 저장
 *      - CDP Precise Coverage 로 미사용 JS/CSS 바이트 산출
 *   4. perf-out/bundle/<label>/ 아래에 raw 데이터 + summary.md 저장
 *
 * diff 는 두 스냅샷의 bundle/network/coverage 지표를 표로 비교해
 *   perf-out/bundle/diff.md 를 남긴다. 임계값 초과 시 exit 1.
 */

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import net from "node:net";

// ─────────────── 상수 ───────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_ROOT = path.join(ROOT, "perf-out", "bundle");
const DIST = path.join(ROOT, "dist");
const LABELS = ["before", "after"];
const MODE = process.argv[2];

// 진입 페이지. 로그인 게이트 있어 무인증도 sign-in 으로 튕겨지지만, 그 로딩까지
// 초기 청크가 대부분 잡히므로 문제 없음.
const START_PATH = "/";

// diff 판정 임계값 (%). 총 gzip / 진입 청크 gzip 이 이 이상 늘면 fail.
const REGRESSION_THRESHOLD_PCT = 5;

// ─────────────── 유틸 ───────────────
const usage = () => {
  console.error("usage: node scripts/perf-measure-bundle.mjs <before|after|diff>");
  process.exit(1);
};

if (!MODE || !["before", "after", "diff"].includes(MODE)) usage();

const b = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : String(n));
const kb = (n) => (typeof n === "number" ? (n / 1024).toFixed(1) + " KB" : "—");
const pct = (a, b) => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return "—";
  const d = ((a - b) / b) * 100;
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
};

function gzipSize(buf) {
  return zlib.gzipSync(buf, { level: 9 }).length;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function repoSourceSize() {
  // 리포지토리 소스 트리 크기(빌드/캐시 제외). Step 1(죽은 자산 삭제)의 감량 측정용.
  const skip = new Set([
    ".git",
    "node_modules",
    "dist",
    "dist-electron",
    "perf-out",
    ".omc",
    ".turbo",
    ".next",
    ".vercel",
  ]);
  let total = 0;
  function recur(p) {
    let stat;
    try { stat = fs.statSync(p); } catch { return; }
    if (stat.isDirectory()) {
      const name = path.basename(p);
      if (skip.has(name)) return;
      for (const child of fs.readdirSync(p)) recur(path.join(p, child));
    } else {
      total += stat.size;
    }
  }
  recur(ROOT);
  return total;
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitForHttpReady(url, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 304) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite preview 가 ${timeoutMs}ms 안에 응답하지 않았습니다: ${url}`);
}

// ─────────────── 스냅샷 ───────────────
async function snapshot(label) {
  if (!LABELS.includes(label)) usage();
  const outDir = path.join(OUT_ROOT, label);
  fs.mkdirSync(outDir, { recursive: true });

  // 1) 정리 + 빌드
  console.log(`[${label}] dist 정리 · vite build 시작`);
  fs.rmSync(DIST, { recursive: true, force: true });
  await runNpm("build:web");

  // 2) 번들 스캔
  console.log(`[${label}] 번들 스캔`);
  const files = walk(DIST).map((abs) => {
    const rel = path.relative(DIST, abs);
    const bin = fs.readFileSync(abs);
    return {
      path: rel,
      bytes: bin.length,
      gzip: gzipSize(bin),
      ext: path.extname(rel).slice(1),
    };
  });
  const jsFiles = files.filter((f) => f.ext === "js");
  const cssFiles = files.filter((f) => f.ext === "css");
  const distBytes = files.reduce((s, f) => s + f.bytes, 0);
  const jsBytes = jsFiles.reduce((s, f) => s + f.bytes, 0);
  const jsGzip = jsFiles.reduce((s, f) => s + f.gzip, 0);
  const cssBytes = cssFiles.reduce((s, f) => s + f.bytes, 0);
  const cssGzip = cssFiles.reduce((s, f) => s + f.gzip, 0);
  const indexChunk = jsFiles.find((f) => /assets\/index-.*\.js$/.test(f.path));
  const largestLazy = [...jsFiles].sort((a, b) => b.bytes - a.bytes)[0];

  const bundle = {
    distBytes,
    jsBytes,
    jsGzip,
    cssBytes,
    cssGzip,
    indexChunk: indexChunk ?? null,
    largestChunk: largestLazy ?? null,
    files: files.sort((a, b) => b.bytes - a.bytes),
    repoSourceBytes: repoSourceSize(),
  };
  fs.writeFileSync(path.join(outDir, "bundle.json"), JSON.stringify(bundle, null, 2));

  // 3) vite preview + Playwright 런타임 캡처
  console.log(`[${label}] vite preview 기동`);
  const port = await pickFreePort();
  const preview = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  preview.stdout.on("data", (d) => process.stdout.write(`[preview] ${d}`));
  preview.stderr.on("data", (d) => process.stderr.write(`[preview] ${d}`));

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHttpReady(baseUrl);

    console.log(`[${label}] Chromium 기동 · 홈 로딩`);
    const browser = await chromium.launch({ headless: true });
    try {
      const harPath = path.join(outDir, "har.json");
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        recordHar: { path: harPath, mode: "full", content: "attach" },
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);

      const responses = [];
      const consoleLogs = [];
      const pageErrors = [];
      const requestFailures = [];

      // CDP Network 이벤트로 encodedDataLength(=바이트 실전송량) 를 수집.
      // vite preview 는 gzip 응답을 항상 주지 않아서, response 헤더 Content-Length 만
      // 믿으면 절반 이상이 null 로 잡힌다. CDP 는 소켓 위 실측치를 준다.
      const requests = new Map(); // requestId → { url, resourceType, mimeType, status, encodedDataLength }
      await cdp.send("Network.enable");
      cdp.on("Network.requestWillBeSent", (e) => {
        requests.set(e.requestId, {
          requestId: e.requestId,
          url: e.request.url,
          method: e.request.method,
          resourceType: (e.type ?? "").toLowerCase(),
        });
      });
      cdp.on("Network.responseReceived", (e) => {
        const r = requests.get(e.requestId) ?? {};
        Object.assign(r, {
          status: e.response.status,
          mimeType: e.response.mimeType,
          resourceType: (e.type ?? r.resourceType ?? "").toLowerCase(),
          contentEncoding: e.response.headers?.["content-encoding"] ?? e.response.headers?.["Content-Encoding"] ?? null,
        });
        requests.set(e.requestId, r);
      });
      cdp.on("Network.loadingFinished", (e) => {
        const r = requests.get(e.requestId);
        if (r) r.encodedDataLength = e.encodedDataLength;
      });
      cdp.on("Network.loadingFailed", (e) => {
        requestFailures.push({ url: requests.get(e.requestId)?.url, error: e.errorText });
      });

      page.on("console", (msg) => {
        consoleLogs.push({ type: msg.type(), text: msg.text(), location: msg.location() });
      });
      page.on("pageerror", (err) => pageErrors.push({ message: err.message, stack: err.stack }));
      page.on("requestfailed", (req) => requestFailures.push({ url: req.url(), failure: req.failure()?.errorText }));
      page.on("console", (msg) => {
        consoleLogs.push({ type: msg.type(), text: msg.text(), location: msg.location() });
      });
      page.on("pageerror", (err) => pageErrors.push({ message: err.message, stack: err.stack }));
      page.on("requestfailed", (req) => requestFailures.push({ url: req.url(), failure: req.failure()?.errorText }));

      // Precise coverage — JS/CSS 미사용률
      // callCount=true 로 정확한 hit count 를 받아야 unused 영역 판별이 안정된다.
      await cdp.send("Profiler.enable");
      await cdp.send("Debugger.enable");
      await cdp.send("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
      await cdp.send("CSS.enable").catch(() => {});
      await cdp.send("DOM.enable").catch(() => {});
      await cdp.send("CSS.startRuleUsageTracking").catch(() => {});

      const t0 = Date.now();
      await page.goto(baseUrl + START_PATH, { waitUntil: "networkidle", timeout: 30_000 });
      const loadMs = Date.now() - t0;

      await page.waitForTimeout(1000);

      const jsCoverage = await cdp.send("Profiler.takePreciseCoverage");
      await cdp.send("Profiler.stopPreciseCoverage");
      const cssCoverage = await cdp.send("CSS.stopRuleUsageTracking").catch(() => ({ ruleUsage: [] }));

      // 미사용 JS 바이트 = 각 스크립트별 (전체 - 사용) 합
      // 전체 크기는 Debugger.getScriptSource 로 실 소스 길이를 뽑는다 (endOffset 근사보다 정확).
      let jsUsedBytes = 0;
      let jsTotalBytes = 0;
      for (const script of jsCoverage.result ?? []) {
        if (!script.url || script.url.startsWith("chrome-extension://")) continue;
        // 앱 자산만 계측 (vite preview 는 /assets/*.js 로 서빙)
        if (!script.url.includes(baseUrl) && !script.url.startsWith("http://127.0.0.1")) continue;

        let total = 0;
        try {
          const src = await cdp.send("Debugger.getScriptSource", { scriptId: script.scriptId });
          total = Buffer.byteLength(src.scriptSource ?? "", "utf8");
        } catch {
          // fallback: endOffset 최댓값
          total = script.functions?.reduce((m, fn) => {
            for (const r of fn.ranges ?? []) if (r.endOffset > m) m = r.endOffset;
            return m;
          }, 0) ?? 0;
        }

        const ranges = [];
        for (const fn of script.functions ?? []) {
          for (const r of fn.ranges ?? []) {
            if (r.count > 0) ranges.push([r.startOffset, r.endOffset]);
          }
        }
        ranges.sort((a, b) => a[0] - b[0]);
        let used = 0;
        let curEnd = 0;
        for (const [s, e] of ranges) {
          const start = Math.max(s, curEnd);
          if (e > start) {
            used += e - start;
            curEnd = e;
          }
        }
        jsUsedBytes += Math.min(used, total);
        jsTotalBytes += total;
      }

      let cssUsed = 0, cssTotal = 0;
      for (const r of cssCoverage.ruleUsage ?? []) {
        cssTotal += r.endOffset - r.startOffset;
        if (r.used) cssUsed += r.endOffset - r.startOffset;
      }

      await context.close();
      await browser.close();

      // 리퀘스트 맵 → 배열. resourceType 은 CDP 이벤트의 문자열을 그대로 씀
      // (Document / Script / Stylesheet / Font / Image / XHR / Fetch / Other).
      const netRows = [...requests.values()];
      const sum = (filter) =>
        netRows.filter(filter).reduce((s, r) => s + (r.encodedDataLength ?? 0), 0);
      const isType = (t) => (r) => (r.resourceType ?? "").toLowerCase() === t.toLowerCase();

      const network = {
        loadMs,
        totalRequests: netRows.length,
        totalTransferBytes: sum(() => true),
        jsRequests: netRows.filter(isType("script")).length,
        jsTransferBytes: sum(isType("script")),
        cssTransferBytes: sum(isType("stylesheet")),
        fontTransferBytes: sum(isType("font")),
        imageTransferBytes: sum(isType("image")),
        requestFailures,
        responses: netRows,
      };
      const consoleReport = {
        errors: consoleLogs.filter((l) => l.type === "error"),
        warnings: consoleLogs.filter((l) => l.type === "warning" || l.type === "warn"),
        logs: consoleLogs.filter((l) => !["error", "warning", "warn"].includes(l.type)),
        pageErrors,
      };
      const coverage = {
        jsTotalBytes,
        jsUsedBytes,
        jsUnusedBytes: jsTotalBytes - jsUsedBytes,
        jsUnusedPct: jsTotalBytes ? ((jsTotalBytes - jsUsedBytes) / jsTotalBytes) * 100 : null,
        cssTotalBytes: cssTotal,
        cssUsedBytes: cssUsed,
        cssUnusedBytes: cssTotal - cssUsed,
        cssUnusedPct: cssTotal ? ((cssTotal - cssUsed) / cssTotal) * 100 : null,
      };

      fs.writeFileSync(path.join(outDir, "network.json"), JSON.stringify(network, null, 2));
      fs.writeFileSync(path.join(outDir, "console.json"), JSON.stringify(consoleReport, null, 2));
      fs.writeFileSync(path.join(outDir, "coverage.json"), JSON.stringify(coverage, null, 2));

      // 요약 markdown
      const md = renderSnapshotMd(label, bundle, network, consoleReport, coverage);
      fs.writeFileSync(path.join(outDir, "summary.md"), md);
      console.log(`\n[${label}] → ${outDir}/summary.md`);
      console.log(md);
    } finally {
      // browser 는 try 내부에서 닫힘
    }
  } finally {
    preview.kill("SIGINT");
    await new Promise((r) => setTimeout(r, 200));
  }
}

// ─────────────── 스냅샷 md 렌더 ───────────────
function renderSnapshotMd(label, bundle, network, consoleReport, coverage) {
  const rows = bundle.files.slice(0, 12).map((f) => `| ${f.path} | ${kb(f.bytes)} | ${kb(f.gzip)} |`).join("\n");
  return `# ${label} 스냅샷

- 측정 시각: ${new Date().toISOString()}
- START_PATH: \`${START_PATH}\`

## 번들 (dist)

| 항목 | 값 |
|---|---|
| dist 총합 | ${kb(bundle.distBytes)} |
| JS raw / gzip | ${kb(bundle.jsBytes)} / ${kb(bundle.jsGzip)} |
| CSS raw / gzip | ${kb(bundle.cssBytes)} / ${kb(bundle.cssGzip)} |
| 진입 청크 (raw / gzip) | ${bundle.indexChunk ? `${kb(bundle.indexChunk.bytes)} / ${kb(bundle.indexChunk.gzip)}` : "—"} |
| 최대 청크 | ${bundle.largestChunk ? `${bundle.largestChunk.path} — ${kb(bundle.largestChunk.bytes)}` : "—"} |
| 리포 소스 트리 (build/node_modules 제외) | ${kb(bundle.repoSourceBytes)} |

### 큰 파일 Top 12
| 파일 | raw | gzip |
|---|---|---|
${rows}

## 네트워크 (홈 로딩)

| 항목 | 값 |
|---|---|
| load(networkidle)까지 | ${network.loadMs} ms |
| 요청 수 | ${network.totalRequests} |
| transfer 합계 (encoded) | ${b(network.totalTransferBytes)} bytes |
| JS 요청 수 / transfer | ${network.jsRequests} / ${b(network.jsTransferBytes)} bytes |
| CSS transfer | ${b(network.cssTransferBytes)} bytes |
| 폰트 transfer | ${b(network.fontTransferBytes)} bytes |
| 이미지 transfer | ${b(network.imageTransferBytes)} bytes |
| 요청 실패 | ${network.requestFailures.length} |

## 콘솔

| 항목 | 값 |
|---|---|
| errors | ${consoleReport.errors.length} |
| warnings | ${consoleReport.warnings.length} |
| pageerrors | ${consoleReport.pageErrors.length} |

## Coverage (초기 로딩 시 미사용률)

| 항목 | 값 |
|---|---|
| JS total (CDP) | ${b(coverage.jsTotalBytes)} bytes |
| JS used | ${b(coverage.jsUsedBytes)} bytes |
| JS unused | ${b(coverage.jsUnusedBytes)} bytes (${coverage.jsUnusedPct?.toFixed(1) ?? "—"}%) |
| CSS total | ${b(coverage.cssTotalBytes)} bytes |
| CSS used | ${b(coverage.cssUsedBytes)} bytes |
| CSS unused | ${b(coverage.cssUnusedBytes)} bytes (${coverage.cssUnusedPct?.toFixed(1) ?? "—"}%) |
`;
}

// ─────────────── diff ───────────────
function loadSnapshot(label) {
  const dir = path.join(OUT_ROOT, label);
  const read = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
  return {
    bundle: read("bundle.json"),
    network: read("network.json"),
    console: read("console.json"),
    coverage: read("coverage.json"),
  };
}

function diffMode() {
  for (const label of LABELS) {
    const dir = path.join(OUT_ROOT, label);
    if (!fs.existsSync(path.join(dir, "bundle.json"))) {
      console.error(`스냅샷 없음: ${label}. 먼저 \`node scripts/perf-measure-bundle.mjs ${label}\`.`);
      process.exit(1);
    }
  }
  const before = loadSnapshot("before");
  const after = loadSnapshot("after");
  const line = (label, a, b, unit = "bytes") => `| ${label} | ${b} ${unit} | ${a} ${unit} | ${pct(a, b)} |`;

  const primaryChecks = [
    { name: "JS gzip 총합", a: after.bundle.jsGzip, b: before.bundle.jsGzip },
    { name: "index 청크 gzip", a: after.bundle.indexChunk?.gzip ?? 0, b: before.bundle.indexChunk?.gzip ?? 0 },
    { name: "홈 로딩 transfer 합계", a: after.network.totalTransferBytes, b: before.network.totalTransferBytes },
    { name: "홈 로딩 JS transfer", a: after.network.jsTransferBytes, b: before.network.jsTransferBytes },
  ];

  const md = [];
  md.push(`# before ↔ after 비교`);
  md.push(``);
  md.push(`- 임계값: 주요 지표 회귀 ${REGRESSION_THRESHOLD_PCT}% 이상 시 fail.`);
  md.push(``);
  md.push(`## 번들`);
  md.push(``);
  md.push(`| 지표 | before | after | Δ |`);
  md.push(`|---|---|---|---|`);
  md.push(line("dist 총합", after.bundle.distBytes, before.bundle.distBytes));
  md.push(line("JS raw", after.bundle.jsBytes, before.bundle.jsBytes));
  md.push(line("JS gzip", after.bundle.jsGzip, before.bundle.jsGzip));
  md.push(line("CSS raw", after.bundle.cssBytes, before.bundle.cssBytes));
  md.push(line("CSS gzip", after.bundle.cssGzip, before.bundle.cssGzip));
  md.push(line("index gzip", after.bundle.indexChunk?.gzip ?? 0, before.bundle.indexChunk?.gzip ?? 0));
  md.push(line("최대 청크 raw", after.bundle.largestChunk?.bytes ?? 0, before.bundle.largestChunk?.bytes ?? 0));
  md.push(line("리포 소스 트리", after.bundle.repoSourceBytes, before.bundle.repoSourceBytes));
  md.push(``);
  md.push(`## 네트워크 (홈 로딩)`);
  md.push(``);
  md.push(`| 지표 | before | after | Δ |`);
  md.push(`|---|---|---|---|`);
  md.push(line("load(networkidle) ms", after.network.loadMs, before.network.loadMs, "ms"));
  md.push(line("요청 수", after.network.totalRequests, before.network.totalRequests, "개"));
  md.push(line("transfer 합계", after.network.totalTransferBytes, before.network.totalTransferBytes));
  md.push(line("JS transfer", after.network.jsTransferBytes, before.network.jsTransferBytes));
  md.push(line("CSS transfer", after.network.cssTransferBytes, before.network.cssTransferBytes));
  md.push(line("폰트 transfer", after.network.fontTransferBytes, before.network.fontTransferBytes));
  md.push(``);
  md.push(`## Coverage`);
  md.push(``);
  md.push(`| 지표 | before | after | Δ |`);
  md.push(`|---|---|---|---|`);
  md.push(line("JS unused bytes", after.coverage.jsUnusedBytes, before.coverage.jsUnusedBytes));
  md.push(line("CSS unused bytes", after.coverage.cssUnusedBytes, before.coverage.cssUnusedBytes));
  md.push(``);
  md.push(`## 콘솔 회귀 감시`);
  md.push(``);
  md.push(`| 지표 | before | after |`);
  md.push(`|---|---|---|`);
  md.push(`| errors | ${before.console.errors.length} | ${after.console.errors.length} |`);
  md.push(`| warnings | ${before.console.warnings.length} | ${after.console.warnings.length} |`);
  md.push(`| pageerrors | ${before.console.pageErrors.length} | ${after.console.pageErrors.length} |`);
  md.push(``);
  md.push(`## 판정`);
  md.push(``);
  let fail = false;
  for (const c of primaryChecks) {
    const delta = c.b === 0 ? 0 : ((c.a - c.b) / c.b) * 100;
    const regressed = delta > REGRESSION_THRESHOLD_PCT;
    const emoji = regressed ? "⚠" : (delta < -REGRESSION_THRESHOLD_PCT ? "✓" : "·");
    if (regressed) fail = true;
    md.push(`- ${emoji} ${c.name}: ${pct(c.a, c.b)}`);
  }
  md.push(``);
  md.push(fail ? `**결과: FAIL — 주요 지표가 임계값을 넘어 회귀했습니다.**` : `**결과: OK**`);

  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const out = path.join(OUT_ROOT, "diff.md");
  const text = md.join("\n") + "\n";
  fs.writeFileSync(out, text);
  console.log(text);
  console.log(`→ ${out}`);
  process.exit(fail ? 1 : 0);
}

// ─────────────── 실행 ───────────────
function runNpm(script) {
  return new Promise((resolve, reject) => {
    const p = spawn("npm", ["run", script], { cwd: ROOT, stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`npm run ${script} exit ${code}`))));
  });
}

if (MODE === "diff") {
  diffMode();
} else {
  snapshot(MODE).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
