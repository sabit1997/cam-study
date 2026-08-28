// scripts/measure-static-cache.mjs
// 사용법: node scripts/measure-static-cache.mjs [--runs=N]
// 결과: bundle-out/static-cache/{summary.md, raw.json}
//
// 데스크탑 앱은 로컬 Express 가 dist 를 서빙한다(src-electron/express-server.ts).
// 캐시 헤더가 없으면 앱을 켤 때마다 브라우저가 조건부 요청을 보내 200/304 를 왕복한다.
// 여기서는 **앱을 두 번 여는 것**을 흉내내서 두 번째 실행의 서버 요청을 센다.
//
// ## 서버를 두 벌 만드는 이유
// before 는 이전 커밋의 코드이고 after 는 지금 코드다. 한 프로세스에서 두 버전의
// TypeScript 를 동시에 로드할 수 없어서, 여기서는 **정책만 재현한 서버 두 개**를 띄운다.
//   before  express.static 기본값 — Cache-Control: public, max-age=0 (+ ETag·Last-Modified)
//   after   /assets 는 immutable, 그 외는 no-cache
//
// before 를 "헤더 없음" 으로 재현했다가 틀렸다. express.static 은 헤더를 안 주는 것이
// 아니라 `public, max-age=0` 을 준다 — 캐시는 하되 쓰기 전에 매번 물어보라는 뜻이다.
// 헤더를 아예 빼면 Chrome 이 조건부 요청조차 보내지 않아 304 가 0건이 되고, 그러면
// "재검증 왕복이 사라졌다" 는 비교 자체가 성립하지 않는다.
//
// after 쪽 헤더 값이 실제 코드와 같은지는 src-electron/express-server.test.ts 가
// 앱을 띄워 응답 헤더로 확인한다. 역할이 나뉜다 — 저기는 "코드가 그 헤더를 주는가",
// 여기는 "그 헤더가 요청을 없애는가".
//
// 서비스 워커는 차단한다. 켜두면 SW 캐시와 HTTP 캐시가 섞여 어느 쪽 효과인지 알 수 없다.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

const ROOT = path.join(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "bundle-out", "static-cache");
const DIST = path.join(ROOT, "bundle-out", "after", "dist-snapshot");

const RUNS = Number(
  (process.argv.find((a) => a.startsWith("--runs=")) ?? "").split("=")[1] ?? 5
);

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error(`${path.relative(ROOT, DIST)}/index.html 이 없습니다. timing:snapshot after 를 먼저 돌리세요.`);
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const kb = (v) => (v == null ? "—" : `${(v / 1024).toFixed(1)} KB`);
const mark = (ok) => (ok ? "✓" : "⚠");
const median = (a) => {
  const s = [...a].filter((x) => typeof x === "number").sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/**
 * @param withCacheHeaders after 정책을 적용할지. false 면 예전 동작(헤더 없음).
 */
function serve(dir, log, withCacheHeaders) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);

    // API 는 서버에서 직접 처리한다. Playwright 의 context.route 를 하나라도 등록하면
    // 모든 요청이 인터셉트 경로를 타면서 브라우저 캐시가 우회된다 — HTTP 캐시를 재는
    // 측정에서는 그게 곧 측정 실패다(실제로 304 가 0건 나왔다).
    if (urlPath.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end("[]");
      return;
    }

    let file = path.join(dir, urlPath);
    let isFallback = false;
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dir, "index.html");
      isFallback = true;
    }
    const body = fs.readFileSync(file);
    const stat = fs.statSync(file);

    const headers = {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      // express.static 은 헤더 유무와 무관하게 ETag·Last-Modified 를 준다.
      // 그래야 before 가 "조건부 요청으로 304 를 받는" 실제 동작이 된다.
      ETag: `W/"${stat.size}-${stat.mtimeMs}"`,
      "Last-Modified": stat.mtime.toUTCString(),
    };
    headers["Cache-Control"] = withCacheHeaders
      ? urlPath.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache"
      : // express.static 기본값
        "public, max-age=0";

    const conditional =
      req.headers["if-none-match"] === headers.ETag ||
      req.headers["if-modified-since"] === headers["Last-Modified"];

    log.push({ path: urlPath, status: conditional ? 304 : 200, bytes: conditional ? 0 : body.length });

    if (conditional) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    res.end(isFallback && req.method === "HEAD" ? undefined : body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function runOnce(browser, base, serverLog) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    // SW 를 켜면 SW 캐시와 HTTP 캐시가 섞인다
    serviceWorkers: "block",
  });
  await context.addCookies([
    {
      name: "cam-study-user",
      value: encodeURIComponent(JSON.stringify({ userId: 1, username: "static" })),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  // context.route 는 쓰지 않는다 — 위 serve() 주석 참고.
  const page = await context.newPage();
  const mark0 = () => serverLog.length;

  try {
    // ── 1회차 실행 ──
    await page.goto(base + "/", { waitUntil: "networkidle", timeout: 60_000 });

    // ── 2회차 실행 (앱을 다시 연 것) ──
    const from = mark0();
    await page.goto(base + "/?run2=1", { waitUntil: "networkidle", timeout: 60_000 });
    const entries = serverLog.slice(from);

    return {
      requests: entries.length,
      bytes: entries.reduce((s, e) => s + e.bytes, 0),
      status304: entries.filter((e) => e.status === 304).length,
      status200: entries.filter((e) => e.status === 200).length,
    };
  } finally {
    await context.close();
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const logs = { before: [], after: [] };
const servers = {
  before: await serve(DIST, logs.before, false),
  after: await serve(DIST, logs.after, true),
};

const browser = await chromium.launch({ channel: "chrome" });
const results = { before: [], after: [] };

try {
  console.log(`정적 캐시 헤더 측정 · ${RUNS}회 · 서비스 워커 차단 (HTTP 캐시만)\n`);
  for (let run = 1; run <= RUNS; run++) {
    const order = run % 2 === 1 ? ["before", "after"] : ["after", "before"];
    for (const label of order) {
      const r = await runOnce(browser, `http://127.0.0.1:${servers[label].port}`, logs[label]);
      results[label].push({ run, ...r });
      console.log(
        `run ${run} ${label.padEnd(6)} 2회차 서버 요청 ${String(r.requests).padStart(2)}건 (200:${r.status200} 304:${r.status304}) ${kb(r.bytes)}`
      );
    }
  }
} finally {
  await browser.close();
  for (const label of ["before", "after"]) {
    await new Promise((r) => servers[label].server.close(r));
  }
}

const stat = (label, key) => median(results[label].map((r) => r[key]));

fs.writeFileSync(
  path.join(OUT_DIR, "raw.json"),
  JSON.stringify({ measuredAt: new Date().toISOString(), runs: RUNS, results }, null, 2)
);

let md = `# 정적 자산 캐시 헤더 (${RUNS}회 중앙값)\n\n`;
md += `- 측정일: ${new Date().toISOString()}\n`;
md += `- 데스크탑 앱을 **두 번째로 열었을 때** 로컬 Express 가 받는 요청을 센다.\n`;
md += `- before 는 \`express.static\` 기본값 — \`Cache-Control: public, max-age=0\`. 헤더가 없는 게 아니라 "캐시는 하되 쓰기 전에 매번 물어보라" 다.\n`;
md += `- after 는 \`/assets\` 에 \`max-age=31536000, immutable\`, 그 외에는 \`no-cache\`.\n`;
md += `- 두 서버 모두 ETag·Last-Modified 를 주므로 before 의 재요청은 304 로 끝난다 — 본문은 안 오지만 **왕복은 그대로 일어난다**. 그래서 전송 본문은 두 라벨이 같고, 줄어드는 것은 왕복 횟수다.\n`;
md += `- 서비스 워커는 차단했다. 켜두면 SW 캐시와 HTTP 캐시가 섞여 어느 쪽 효과인지 알 수 없다.\n`;
md += `- Playwright 의 \`context.route\` 는 쓰지 않는다. 하나라도 등록하면 모든 요청이 인터셉트 경로를 타면서 브라우저 캐시가 우회돼 304 가 0건이 된다.\n\n`;

md += `| 지표 | before | after | 차이 |\n|---|---|---|---|\n`;
const rows = [
  ["2회차 서버 요청", "requests", (v) => String(v)],
  ["  그중 200", "status200", (v) => String(v)],
  ["  그중 304 (조건부 왕복)", "status304", (v) => String(v)],
  ["2회차 전송 본문", "bytes", kb],
];
for (const [name, key, fmt] of rows) {
  const b = stat("before", key);
  const a = stat("after", key);
  const diff = b != null && a != null ? `${a - b > 0 ? "+" : ""}${fmt(a - b)}` : "—";
  md += `| ${name} | ${fmt(b)} | ${fmt(a)} | ${diff} |\n`;
}

md += `\n## 자가 점검\n\n| 항목 | 기대 | 관측 | 결과 | 힌트 |\n|---|---|---|---|---|\n`;
const checks = [
  {
    name: "before 에서 조건부 왕복이 실제로 일어난다",
    expected: "304 ≥ 1",
    got: String(stat("before", "status304")),
    ok: (stat("before", "status304") ?? 0) >= 1,
    hint: "ETag 를 안 주고 있거나 브라우저가 아예 재요청을 안 했다 — 비교 자체가 성립하지 않는다",
  },
  {
    name: "after 에서 자산 재요청이 사라진다",
    expected: "before 보다 적음",
    got: `${stat("before", "requests")} → ${stat("after", "requests")}`,
    ok: (stat("after", "requests") ?? 0) < (stat("before", "requests") ?? 0),
    hint: "immutable 이 안 먹었다 — 경로 판정이나 헤더 문자열을 확인",
  },
];
for (const c of checks) {
  md += `| ${c.name} | ${c.expected} | ${c.got} | ${mark(c.ok)} | ${c.ok ? "" : c.hint} |\n`;
}

fs.writeFileSync(path.join(OUT_DIR, "summary.md"), md);
console.log("\n" + md);
console.log(`→ ${path.relative(ROOT, path.join(OUT_DIR, "summary.md"))}`);
