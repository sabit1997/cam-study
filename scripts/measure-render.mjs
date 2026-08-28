// scripts/measure-render.mjs
// 사용법: (별도 터미널) npm run dev:web
//         node scripts/measure-render.mjs <label>
// 결과: bundle-out/render/<label>.json
//       node scripts/measure-render.mjs --compare  → summary.md
//
// 리렌더는 번들 크기와 다른 축이다. 바이트가 그대로여도 같은 화면을 몇 번 다시
// 그리느냐가 달라진다. dev/perfProbe.ts 의 Profiler 카운터를 읽어 그걸 잰다.
//
// ## 왜 dev 서버인가
// window.__perf 는 import.meta.env.DEV 에서만 붙는다(App.tsx). 프로덕션에 남기면
// buckets 가 무한 누적되기 때문이다. 그래서 이 측정만은 dev 빌드에서 한다.
// 절대 시간은 프로덕션보다 느리지만 **커밋 횟수**는 React 동작이라 같다.
//
// ## 시나리오 셋
//   idle    아무것도 안 하고 3초. 상단바 시계가 초당 한 번 상태를 바꾼다.
//   focus   창을 번갈아 클릭. zIndex 가 바뀌며 창들이 다시 그려진다.
//   resize  창 폭을 줄인다. 뷰포트 변화가 모든 창의 좌표 동기화 effect 를 깨운다.
//
// 세 시나리오가 각각 다른 변경을 겨눈다 — 시계 분리, 자식 memo, setPos 값 비교.
//
// ## 커밋 횟수가 안 줄어도 개선일 수 있다
// Profiler 가 App 전체를 감싸고 있어서, 트리 어디가 얼마나 다시 그려지든 커밋은
// 1회로 잡힌다. 시계를 별도 컴포넌트로 내리면 초당 한 번 다시 그리는 **범위**가
// 상단바 전체에서 <span> 하나로 줄지만 커밋 횟수는 그대로다. 그래서 이 하네스의
// 주 지표는 횟수가 아니라 totalDuration·maxDuration 이다.
//
// 인증과 창 목록은 주입한다. 실서버에는 요청이 가지 않는다.

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.join(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "bundle-out", "render");
const APP_URL = "http://localhost:3000";

const COMPARE = process.argv.includes("--compare");
const LABEL = process.argv[2];

const RUNS = Number(
  (process.argv.find((a) => a.startsWith("--runs=")) ?? "").split("=")[1] ?? 5
);

/**
 * 창 5개. 좌표는 1920×1080 기준이고 getPositionScale 로 축소된다.
 *
 * 겹치지 않게 배치한 것이 중요하다. focus 시나리오가 타이틀바를 클릭하는데, 창이
 * 겹치면 위에 있는 창이 포인터를 가로채 Playwright 가 "intercepts pointer events" 로
 * 재시도만 반복한다.
 */
const WINDOW_FIXTURE = [
  { id: 9001, type: "todo", x: 20, y: 20, width: 360, height: 480, zIndex: 1, userId: "render", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: 9002, type: "timer", x: 420, y: 20, width: 320, height: 380, zIndex: 2, userId: "render", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: 9003, type: "todo", x: 780, y: 20, width: 360, height: 480, zIndex: 3, userId: "render", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: 9004, type: "timer", x: 20, y: 540, width: 320, height: 380, zIndex: 4, userId: "render", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: 9005, type: "todo", x: 420, y: 540, width: 360, height: 480, zIndex: 5, userId: "render", createdAt: "2026-01-01T00:00:00.000Z" },
];

const START_WIDTH = 1500;
const END_WIDTH = 1000;
const STEP = 25;
const STEP_DELAY = 16;
const SETTLE_MS = 900;
const IDLE_MS = 3000;
const CPU_THROTTLE = 4;

const median = (a) => {
  const s = [...a].filter((x) => typeof x === "number").sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const mark = (ok) => (ok ? "✓" : "⚠");

function mockApi(pathname) {
  if (pathname === "/api/windows") return WINDOW_FIXTURE;
  if (/^\/api\/windows\/\d+\/todos$/.test(pathname)) return [];
  if (pathname === "/api/timer/today") return { totalSeconds: 0, dailyHourGoal: 0, pomoCycles: 0 };
  if (pathname === "/api/timer/goal") return { hour: 0 };
  return {};
}

// ─────────────── compare 모드 ───────────────
if (COMPARE) {
  const load = (label) => {
    const p = path.join(OUT_DIR, `${label}.json`);
    if (!fs.existsSync(p)) {
      console.error(`${path.relative(ROOT, p)} 가 없습니다. 각 브랜치에서 먼저 측정하세요.`);
      process.exit(1);
    }
    return JSON.parse(fs.readFileSync(p, "utf8"));
  };
  const before = load("before");
  const after = load("after");

  const SCENARIOS = ["idle", "focus", "resize"];
  const METRICS = [
    ["커밋 수", (s) => s.commitCount],
    ["총 렌더 시간 (ms)", (s) => s.totalDuration],
    ["최대 커밋 (ms)", (s) => s.maxDuration],
  ];

  let md = `# 리렌더 비교 (${before.runs}회 중앙값)\n\n`;
  md += `- before: \`${before.commit}\` · after: \`${after.commit}\`\n`;
  md += `- 측정일: ${after.measuredAt}\n`;
  md += `- dev 서버(Vite) · CPU ${CPU_THROTTLE}× · 창 ${WINDOW_FIXTURE.length}개 · Profiler id="App"\n`;
  md += `- 절대 시간은 dev 빌드라 프로덕션보다 느리다. **커밋 횟수**가 주 지표다 — React 동작이라 빌드와 무관하다.\n\n`;

  for (const scenario of SCENARIOS) {
    md += `## ${scenario}\n\n`;
    md += `| 지표 | before | after | 차이 |\n|---|---|---|---|\n`;
    for (const [name, get] of METRICS) {
      const b = median(before.scenarios[scenario].map(get));
      const a = median(after.scenarios[scenario].map(get));
      const diff =
        b != null && a != null
          ? `${a - b > 0 ? "+" : ""}${(a - b).toFixed(a % 1 === 0 && b % 1 === 0 ? 0 : 1)}${b ? ` (${(((a - b) / b) * 100).toFixed(1)} %)` : ""}`
          : "—";
      md += `| ${name} | ${b ?? "—"} | ${a ?? "—"} | ${diff} |\n`;
    }
    // 카운터는 시나리오마다 다른 것이 의미 있다
    const counters = new Set([
      ...before.scenarios[scenario].flatMap((s) => Object.keys(s.counts ?? {})),
      ...after.scenarios[scenario].flatMap((s) => Object.keys(s.counts ?? {})),
    ]);
    for (const key of [...counters].sort()) {
      const b = median(before.scenarios[scenario].map((s) => s.counts?.[key] ?? 0));
      const a = median(after.scenarios[scenario].map((s) => s.counts?.[key] ?? 0));
      md += `| \`${key}\` | ${b} | ${a} | ${a - b > 0 ? "+" : ""}${a - b} |\n`;
    }
    md += `\n`;
  }

  // ── 자가 점검 ──
  const dur = (data, scenario) =>
    median(data.scenarios[scenario].map((s) => s.totalDuration));
  const maxDur = (data, scenario) =>
    median(data.scenarios[scenario].map((s) => s.maxDuration));

  const checks = [
    {
      name: "두 라벨이 서로 다른 커밋",
      expected: "다름",
      got: `${before.commit} / ${after.commit}`,
      ok: before.commit !== after.commit,
      hint: "같은 브랜치에서 두 번 측정했다 — 수치를 인용할 수 없다",
    },
    {
      name: "두 라벨 모두 clean tree",
      expected: "변경 없음",
      got: `${before.dirty ? "변경 있음" : "clean"} / ${after.dirty ? "변경 있음" : "clean"}`,
      ok: !before.dirty && !after.dirty,
      hint: "커밋하거나 stash 한 뒤 재측정",
    },
    {
      // 시계 분리는 커밋 **횟수** 를 줄이지 않는다. Profiler 가 App 전체를 감싸고
      // 있어서 Clock 하나만 다시 그려도 커밋 1회로 잡히기 때문이다. 줄어드는 것은
      // 커밋 **범위** 이고, 그건 렌더 시간에 나타난다.
      name: "idle 렌더 시간이 줄었다 (시계 분리)",
      expected: "totalDuration 감소",
      got: `${dur(before, "idle")} → ${dur(after, "idle")} ms`,
      ok: dur(after, "idle") < dur(before, "idle"),
      hint: "시계가 여전히 상단바 전체를 다시 그리고 있다",
    },
    {
      name: "focus 렌더 시간이 줄었다 (자식 memo)",
      expected: "totalDuration 감소",
      got: `${dur(before, "focus")} → ${dur(after, "focus")} ms`,
      ok: dur(after, "focus") < dur(before, "focus"),
      hint: "memo 가 안 먹었다 — props 참조가 매번 바뀌는지 확인",
    },
    {
      name: "resize 최대 커밋이 줄었다 (setPos 값 비교)",
      expected: "maxDuration 감소",
      got: `${maxDur(before, "resize")} → ${maxDur(after, "resize")} ms`,
      ok: maxDur(after, "resize") < maxDur(before, "resize"),
      hint: "좌표가 같아도 새 객체를 넣고 있다",
    },
    {
      name: "창 개수가 두 라벨에서 같다",
      expected: `${WINDOW_FIXTURE.length} · ${WINDOW_FIXTURE.length}`,
      got: `${before.windowCount} · ${after.windowCount}`,
      ok: before.windowCount === after.windowCount,
      hint: "픽스처가 다르면 비교가 성립하지 않는다",
    },
  ];
  md += `## 자가 점검\n\n| 항목 | 기대 | 관측 | 결과 | 힌트 |\n|---|---|---|---|---|\n`;
  for (const c of checks) {
    md += `| ${c.name} | ${c.expected} | ${c.got} | ${mark(c.ok)} | ${c.ok ? "" : c.hint} |\n`;
  }

  fs.writeFileSync(path.join(OUT_DIR, "summary.md"), md);
  console.log(md);
  console.log(`→ ${path.relative(ROOT, path.join(OUT_DIR, "summary.md"))}`);
  process.exit(0);
}

// ─────────────── 측정 모드 ───────────────
if (!LABEL || LABEL.startsWith("--")) {
  console.error("usage: node scripts/measure-render.mjs <before|after> [--runs=N]\n       node scripts/measure-render.mjs --compare");
  process.exit(1);
}

try {
  const res = await fetch(APP_URL, { method: "GET" });
  if (!res.ok && res.status !== 304) throw new Error(`status ${res.status}`);
} catch {
  console.error(`dev 서버(${APP_URL})에 연결할 수 없습니다. 별도 터미널에서 "npm run dev:web" 을 먼저 실행하세요.`);
  process.exit(1);
}

const { execFileSync } = await import("node:child_process");
let commit = "(unknown)";
let dirty = false;
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
} catch {
  /* git 없어도 계속 */
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  // 다른 하네스와 같은 이유로 시스템 Chrome 을 쓴다(Playwright 전용 Chromium 미설치)
  channel: "chrome",
  headless: false, // headless 는 창 개념이 없어 resize 가 발생하지 않는다
  args: [`--window-size=${START_WIDTH},900`],
});

const scenarios = { idle: [], focus: [], resize: [] };
let windowCount = null;

try {
  for (let run = 1; run <= RUNS; run++) {
    const context = await browser.newContext({
      viewport: null, // 실제 창 크기를 뷰포트로 — 리사이즈 반영에 필수
      serviceWorkers: "block",
    });
    await context.addCookies([
      {
        name: "cam-study-user",
        value: encodeURIComponent(JSON.stringify({ userId: 1, username: "render" })),
        domain: "localhost",
        path: "/",
      },
    ]);
    // `/api` 또는 `/api/...` 만 잡는다. startsWith("/api") 로 하면 dev 서버가
    // 모듈로 서빙하는 소스 경로 `/apis/services/...` 까지 걸려 JSON 이 반환되고
    // "Expected a JavaScript module but got application/json" 으로 앱이 통째로 죽는다.
    // vite.config.mts 의 프록시 정규식에도 같은 주의가 적혀 있다.
    await context.route(
      (url) => url.pathname === "/api" || url.pathname.startsWith("/api/"),
      (route) => {
        const url = new URL(route.request().url());
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockApi(url.pathname)),
        });
      }
    );

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const consoleLines = [];
    page.on("console", (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
    page.on("pageerror", (err) => consoleLines.push(`[pageerror] ${err.message}`));

    try {
      await page.goto(APP_URL + "/", { waitUntil: "networkidle", timeout: 60_000 });
      try {
        await page.waitForSelector("[data-window-id]", { timeout: 30_000 });
      } catch (error) {
        // 창이 안 뜨면 원인을 남긴다. 로그인으로 튕겼는지, API mock 이 안 걸렸는지,
        // 아니면 렌더 오류인지가 여기서 갈린다.
        const shot = path.join(OUT_DIR, `_fail-${LABEL}.png`);
        await page.screenshot({ path: shot }).catch(() => {});
        const state = await page
          .evaluate(() => ({
            url: location.href,
            rootChildren: document.getElementById("root")?.childElementCount ?? -1,
            text: document.body.innerText.slice(0, 300),
          }))
          .catch(() => null);
        console.error(`\n창이 뜨지 않았습니다.`);
        console.error(`  url: ${state?.url}`);
        console.error(`  #root 자식: ${state?.rootChildren}`);
        console.error(`  본문: ${JSON.stringify(state?.text)}`);
        if (consoleLines.length) {
          console.error(`  콘솔:\n    ${consoleLines.slice(-15).join("\n    ")}`);
        }
        console.error(`  스크린샷: ${path.relative(ROOT, shot)}`);
        throw error;
      }
      const count = await page.locator("[data-window-id]").count();
      if (windowCount === null) windowCount = count;
      if (count !== WINDOW_FIXTURE.length) {
        throw new Error(`창 개수 불일치: 기대 ${WINDOW_FIXTURE.length}, 실제 ${count}`);
      }
      const hasProbe = await page.evaluate(() => typeof window.__perf?.dump === "function");
      if (!hasProbe) throw new Error("window.__perf 가 없습니다 — dev 빌드인지 확인하세요.");

      // lazy 청크(Todos·Timer)가 다 붙을 때까지
      await page.waitForTimeout(2500);

      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: START_WIDTH, height: 900 } });
      await page.waitForTimeout(500);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

      // ── idle: 아무것도 하지 않는다. 상단바 시계만 돈다. ──
      await page.evaluate(() => window.__perf.reset());
      await page.waitForTimeout(IDLE_MS);
      scenarios.idle.push(await page.evaluate(() => window.__perf.dump()));

      // ── focus: 창을 번갈아 클릭한다. zIndex 가 바뀐다. ──
      await page.evaluate(() => window.__perf.reset());
      const ids = WINDOW_FIXTURE.map((w) => w.id);
      for (let i = 0; i < 8; i++) {
        const id = ids[i % ids.length];
        await page.locator(`[data-window-id="${id}"] .drag-handle`).click({ position: { x: 120, y: 18 } });
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(SETTLE_MS);
      scenarios.focus.push(await page.evaluate(() => window.__perf.dump()));

      // ── resize: 창 폭을 줄인다. ──
      await page.evaluate(() => window.__perf.reset());
      for (let w = START_WIDTH; w >= END_WIDTH; w -= STEP) {
        await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: w } });
        await page.waitForTimeout(STEP_DELAY);
      }
      await page.waitForTimeout(SETTLE_MS);
      scenarios.resize.push(await page.evaluate(() => window.__perf.dump()));

      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      console.log(
        `run ${run}/${RUNS}  idle ${scenarios.idle.at(-1).commitCount}커밋 · focus ${scenarios.focus.at(-1).commitCount}커밋 ${scenarios.focus.at(-1).totalDuration}ms · resize ${scenarios.resize.at(-1).commitCount}커밋 ${scenarios.resize.at(-1).totalDuration}ms`
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const out = {
  label: LABEL,
  commit,
  dirty,
  measuredAt: new Date().toISOString(),
  runs: RUNS,
  windowCount,
  scenarios,
};
fs.writeFileSync(path.join(OUT_DIR, `${LABEL}.json`), JSON.stringify(out, null, 2));
console.log(`\n→ ${path.relative(ROOT, path.join(OUT_DIR, `${LABEL}.json`))}${dirty ? "  ⚠ working tree 변경 있음" : ""}`);
