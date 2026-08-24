// perf-measure.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

// ─────────────── 설정 (환경에 맞게 수정) ───────────────
const APP_URL = "http://localhost:5173";
const MEASURE_PATH = "/"; // 측정 대상 화면 경로
const WINDOW_SELECTOR = "[data-window-id]"; // ← 실제 DOM에 맞게 교체 (필수)
const WINDOW_API_RE = /window/i; // 창 목록 API URL 패턴

const START_WIDTH = 1600; // 드래그 시작 폭 (px)
const END_WIDTH = 900; // 드래그 끝 폭 (px)
const STEP = 20; // 한 스텝당 축소량
const STEP_DELAY = 16; // 스텝 간 대기 (ms) — 약 60fps
const SETTLE_MS = 1000; // 손 놓고 대기
const NET_DELAY = 40; // 네트워크 지연 흉내
const THROTTLE = 4; // CPU 스로틀 배수
const RUNS = 3;

const LABEL = process.argv[2];
if (!LABEL) {
  console.error("usage: node perf-measure.mjs <before|after>");
  process.exit(1);
}

const FIXTURE = JSON.parse(fs.readFileSync("window-fixture.json", "utf8"));
const fixtureArray = Array.isArray(FIXTURE)
  ? FIXTURE
  : FIXTURE.data ?? FIXTURE.windows ?? [];
const EXPECTED_WINDOWS = fixtureArray.length;
if (EXPECTED_WINDOWS !== 5) {
  console.warn(
    `⚠ fixture의 창 개수가 ${EXPECTED_WINDOWS}입니다. 의도한 값인지 확인하세요.`
  );
}

const OUT_DIR = path.join("perf-out", LABEL);
fs.mkdirSync(OUT_DIR, { recursive: true });

// ─────────────── 1회차 실행 ───────────────
async function runOnce(runIndex) {
  const browser = await chromium.launch({
    headless: false,
    args: [`--window-size=${START_WIDTH},900`],
  });

  const context = await browser.newContext({
    storageState: "perf-auth.json",
    viewport: null, // 실제 창 크기를 뷰포트로 사용 (리사이즈 반영에 필수)
  });

  // GET만 fixture로 고정, 나머지는 실서버로
  await context.route(
    (url) => WINDOW_API_RE.test(url.pathname),
    async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await new Promise((r) => setTimeout(r, NET_DELAY)); // 네트워크 지연 흉내
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FIXTURE),
      });
    }
  );

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  // 로그인 만료 감지
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame() && /login|signin|auth/i.test(f.url())) {
      throw new Error(
        "로그인 화면으로 튕겼습니다. node perf-auth-setup.mjs 재실행 필요."
      );
    }
  });

  await page.goto(APP_URL + MEASURE_PATH, { waitUntil: "networkidle" });

  // ── 가드: 창 개수 검증 (스로틀 켜기 전에)
  await page.waitForSelector(WINDOW_SELECTOR, { timeout: 10_000 });
  const actual = await page.locator(WINDOW_SELECTOR).count();
  if (actual !== EXPECTED_WINDOWS) {
    await browser.close();
    throw new Error(
      `창 개수 불일치: 기대 ${EXPECTED_WINDOWS}, 실제 ${actual}. WINDOW_SELECTOR 또는 fixture 확인.`
    );
  }

  // ── 프로브 존재 확인
  const hasProbe = await page.evaluate(
    () => typeof window.__perf?.dump === "function"
  );
  if (!hasProbe) {
    await browser.close();
    throw new Error(
      "window.__perf 가 없습니다. perfProbe가 개발 빌드에 로드됐는지 확인."
    );
  }

  // ── 안정화 후 스로틀 ON
  await page.waitForTimeout(1500);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });

  const listenersBefore = await getListeners(cdp);

  // ── 트레이싱 + 리셋
  await browser.startTracing(page, {
    path: path.join(OUT_DIR, `trace-${runIndex}.json`),
    categories: ["devtools.timeline"],
  });
  await page.evaluate(() => window.__perf.reset());

  // ── 드래그: 창 폭을 20px씩 축소
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  for (let w = START_WIDTH; w >= END_WIDTH; w -= STEP) {
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { width: w },
    });
    await page.waitForTimeout(STEP_DELAY);
  }

  // ── 손 놓고 1초
  await page.waitForTimeout(SETTLE_MS);

  const dump = await page.evaluate(() => window.__perf.dump());
  await browser.stopTracing();

  const listenersAfter = await getListeners(cdp);

  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await browser.close();

  return { run: runIndex, ...dump, listenersBefore, listenersAfter };
}

async function getListeners(cdp) {
  await cdp.send("Performance.enable").catch(() => {});
  const { metrics } = await cdp.send("Performance.getMetrics");
  return metrics.find((m) => m.name === "JSEventListeners")?.value ?? null;
}

// ─────────────── 집계 ───────────────
const median = (a) => {
  const s = [...a].filter((x) => typeof x === "number").sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const noise = (a) => {
  const s = a.filter((x) => typeof x === "number");
  return s.length ? Math.max(...s) - Math.min(...s) : null;
};
const fmt = (v) =>
  v == null
    ? "—"
    : typeof v === "number"
    ? Number.isInteger(v)
      ? v
      : v.toFixed(2)
    : v;

const results = [];
for (let i = 1; i <= RUNS; i++) {
  console.log(`\n── ${LABEL} run ${i}/${RUNS} ─────────────`);
  results.push(await runOnce(i));
  console.log(JSON.stringify(results.at(-1), null, 2));
}

fs.writeFileSync(
  path.join(OUT_DIR, "raw.json"),
  JSON.stringify(results, null, 2)
);

const pick = (r, k) => r[k] ?? r.counts?.[k] ?? null;
const ROWS = [
  ["resize 이벤트", (r) => pick(r, "resizeEvents")],
  ["커밋 수", (r) => pick(r, "commitCount")],
  ["커밋/이벤트", (r) => pick(r, "commitCount") / pick(r, "resizeEvents")],
  ["total actualDuration", (r) => pick(r, "totalDuration")],
  ["max actualDuration", (r) => pick(r, "maxDuration")],
  ["viewport.set", (r) => pick(r, "viewport.set")],
  ["window.setPos", (r) => pick(r, "window.setPos")],
  ["JS event listeners", (r) => r.listenersAfter],
];

let md = `# ${LABEL} 측정 결과\n\n`;
md += `- 측정일: ${new Date().toISOString()}\n`;
md += `- 스로틀 ${THROTTLE}× · 창 ${EXPECTED_WINDOWS}개 · 드래그 ${START_WIDTH}→${END_WIDTH}px (${STEP}px step) · 대기 ${SETTLE_MS}ms\n\n`;
md += `| 지표 | ${results
  .map((r) => `${r.run}회`)
  .join(" | ")} | 중앙값 | 노이즈 폭 |\n`;
md += `|---|${results.map(() => "---").join("|")}|---|---|\n`;
for (const [name, get] of ROWS) {
  const vals = results.map(get);
  md += `| ${name} | ${vals.map(fmt).join(" | ")} | ${fmt(
    median(vals)
  )} | ${fmt(noise(vals))} |\n`;
}

fs.writeFileSync(path.join(OUT_DIR, "summary.md"), md);
console.log("\n" + md);
console.log(`→ ${OUT_DIR}/summary.md`);
