// perf-measure.mjs
// 사용법: node perf-measure.mjs before | node perf-measure.mjs after
// 결과: perf-out/<label>/summary.md, raw.json, trace-*.json
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

// ─────────────── 설정 ───────────────
const APP_URL = "http://localhost:3000"; // vite.config.mts server.port
const MEASURE_PATH = "/"; // 홈이 WindowZone
const WINDOW_SELECTOR = "[data-window-id]"; // AddWindow 자식 div
// axios baseURL="/api" + WindowEndpoints.getWindows()="/windows"
// 느슨한 정규식(/window/i)은 Vite dev가 서빙하는 /components/window.tsx 까지 걸린다.
const WINDOW_LIST_PATH = "/api/windows";

// 환경 변수로 오버라이드 가능 — 화면 폭이 좁으면 PERF_START_WIDTH/END_WIDTH 를 낮춰서 사용
const START_WIDTH = Number(process.env.PERF_START_WIDTH) || 1600;
const END_WIDTH = Number(process.env.PERF_END_WIDTH) || 900;
const STEP = 20; // 스텝당 축소 폭
const STEP_DELAY = 16; // 스텝 간 대기 (≈60fps)
const SETTLE_MS = 1000; // 드래그 종료 후 대기 (디바운스 100ms + 4× 스로틀 커밋 여유)
const NET_DELAY = 40; // fixture 응답 지연 (실측치로 교체 예정)
const THROTTLE = 4; // CPU 스로틀 배수
const RUNS = 3;
const WARMUP_RUNS = Number(process.env.PERF_WARMUP_RUNS ?? 1); // 첫 회차 튀는 문제 완화용
const STABILIZE_MS = 5000; // 페이지 로드 후 lazy chunk 마운트 대기 — 짧으면 iframe 리스너가 드래그 중에 부착돼 튐

// 자가점검표 기대값 (창 5개)
const EXPECT_RESIZE_MIN = 3;
const EXPECT_RESIZE_MAX = 7;
// listeners 범위는 baseline 재보정 대상 — 실측 후 값이 흔들리면 자가점검에서 참고용만
const EXPECT_LISTENERS_MIN = 350;
const EXPECT_LISTENERS_MAX = 800;

// ─────────────── 인자 · fixture · 출력 ───────────────
const LABEL = process.argv[2];
if (!LABEL) {
  console.error("usage: node perf-measure.mjs <before|after>");
  process.exit(1);
}

// fixture 를 서버 프리체크보다 먼저 읽으므로, 파일 부재 시 친절한 메시지로 종료
let FIXTURE;
try {
  FIXTURE = JSON.parse(fs.readFileSync("window-fixture.json", "utf8"));
} catch (e) {
  console.error(
    `window-fixture.json 을 읽을 수 없습니다 (${e.code ?? e.message}).\n` +
      `  → 실제 세션에서 GET /api/windows 응답을 저장하여 리포지토리 루트에 두세요.`
  );
  process.exit(1);
}
const fixtureArray = Array.isArray(FIXTURE)
  ? FIXTURE
  : FIXTURE.data ?? FIXTURE.windows ?? [];
const EXPECTED_WINDOWS = fixtureArray.length;
if (EXPECTED_WINDOWS === 0) {
  console.error("window-fixture.json 이 비어 있습니다.");
  process.exit(1);
}

const OUT_DIR = path.join("perf-out", LABEL);
fs.mkdirSync(OUT_DIR, { recursive: true });

// After 리프팅 후엔 useViewportSize 인스턴스가 하나뿐이라 이벤트당 1회
// Before 는 창마다 인스턴스가 있어 이벤트당 창 개수만큼 발화
const EXPECTED_VIEWPORT_RATIO = LABEL === "after" ? 1 : EXPECTED_WINDOWS;
// window.setPos 는 리프팅과 무관하게 각 창의 useEffect 에서 발화 → 이벤트당 창 개수
const EXPECTED_SETPOS_RATIO = EXPECTED_WINDOWS;

// ─────────────── dev 서버 프리체크 · 워밍업 ───────────────
try {
  const r = await fetch(APP_URL, { method: "GET" });
  if (!r.ok && r.status !== 304) throw new Error(`status ${r.status}`);
} catch {
  console.error(
    `dev 서버(${APP_URL})에 연결할 수 없습니다. 별도 터미널에서 "npm run dev:web" 을 먼저 실행하세요.`
  );
  process.exit(1);
}

// ─────────────── 1회차 실행 ───────────────
async function runOnce(runIndex) {
  const browser = await chromium.launch({
    headless: false, // headless는 창 개념이 없어 resize가 발생하지 않음
    args: [`--window-size=${START_WIDTH},900`],
  });

  try {
    const context = await browser.newContext({
      storageState: "perf-auth.json",
      viewport: null, // 실제 창 크기를 뷰포트로 사용 — 리사이즈 반영에 필수
    });

    // route 등록은 page.goto 전에.
    // 창 목록 GET 만 fixture 로 고정. PATCH/POST/DELETE 는 실서버 통과.
    await context.route(
      (url) => url.pathname === WINDOW_LIST_PATH,
      async (route) => {
        const req = route.request();
        const method = req.method();
        const url = req.url();
        if (method !== "GET") {
          console.log(`[route] ${method} ${url} → continue`);
          return route.continue();
        }
        await new Promise((r) => setTimeout(r, NET_DELAY));
        console.log(`[route] ${method} ${url} → fulfill(fixture, ${NET_DELAY}ms)`);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(FIXTURE),
        });
      }
    );

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    // 브라우저 콘솔 → 터미널
    page.on("console", (msg) => {
      console.log(`[browser:${msg.type()}] ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      console.error(`[browser:error] ${err.message}`);
    });

    // 로그인 만료 감지
    let loginBounced = false;
    page.on("framenavigated", (f) => {
      if (
        f === page.mainFrame() &&
        /sign-in|signin|login|auth/i.test(f.url())
      ) {
        loginBounced = true;
      }
    });

    await page.goto(APP_URL + MEASURE_PATH, { waitUntil: "networkidle" });
    if (loginBounced) {
      throw new Error(
        "로그인 화면으로 튕겼습니다. 세션 만료 → `node perf-auth-setup.mjs` 를 재실행하세요."
      );
    }

    // ── 화면 폭 하드 가드 (screenW < START_WIDTH 면 OS 가 창 폭을 잘라내어
    //    setWindowBounds 가 무효화되고 실제 드래그 거리가 회차마다 달라진다)
    const screenW = await page.evaluate(() => window.screen.width);
    if (screenW < START_WIDTH) {
      throw new Error(
        `화면 폭(${screenW}px) 이 START_WIDTH(${START_WIDTH}px) 보다 작습니다.\n` +
          `  → PERF_START_WIDTH / PERF_END_WIDTH 환경변수로 낮춰서 재실행하세요.\n` +
          `  → 예: PERF_START_WIDTH=${screenW - 40} PERF_END_WIDTH=${Math.max(END_WIDTH, screenW - 500)} node perf-measure.mjs ${LABEL}`
      );
    }

    // ── 가드: 창 개수 검증 (스로틀 켜기 전)
    await page.waitForSelector(WINDOW_SELECTOR, { timeout: 10_000 });
    const actual = await page.locator(WINDOW_SELECTOR).count();
    if (actual !== EXPECTED_WINDOWS) {
      throw new Error(
        `창 개수 불일치: 기대 ${EXPECTED_WINDOWS}, 실제 ${actual}\n` +
          `  → WINDOW_SELECTOR 또는 fixture 를 확인하세요.`
      );
    }

    // ── 프로브 존재 확인
    const hasProbe = await page.evaluate(
      () => typeof window.__perf?.dump === "function"
    );
    if (!hasProbe) {
      throw new Error(
        "window.__perf 가 없습니다. dev 빌드(import.meta.env.DEV)에서 perfProbe 가 로드됐는지 확인하세요."
      );
    }

    // ── lazy chunk 마운트 완료 대기 — networkidle + STABILIZE_MS 뒤,
    //    리스너 수가 500ms 간격 두 샘플에서 안정될 때까지 대기
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(STABILIZE_MS);
    let prev = await getListeners(cdp);
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);
      const now = await getListeners(cdp);
      if (Math.abs(now - prev) <= 5) break;
      prev = now;
    }

    // ── 창 폭을 START_WIDTH 로 강제 리셋 (macOS 창 상태 캐리오버 방지)
    const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget");
    if (bounds.windowState && bounds.windowState !== "normal") {
      // 최대화 상태면 setWindowBounds 로 크기 변경이 거부됨
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "normal" },
      });
    }
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { width: START_WIDTH, height: 900 },
    });
    await page.waitForTimeout(500); // resize 커밋 반영 대기
    const actualStartW = await page.evaluate(() => window.innerWidth);
    if (Math.abs(actualStartW - START_WIDTH) > 20) {
      throw new Error(
        `창 폭 리셋 실패: 기대 ${START_WIDTH}px, 실제 ${actualStartW}px.\n` +
          `  → OS 가 창 크기를 클램프한 것으로 보입니다. PERF_START_WIDTH 를 낮춰서 재실행하세요.`
      );
    }

    // ── 스로틀 ON (여기서부터가 측정 구간)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });

    const listenersBefore = await getListeners(cdp);

    // ── 트레이싱 시작 + 프로브 리셋
    await browser.startTracing(page, {
      path: path.join(OUT_DIR, `trace-${runIndex}.json`),
      categories: ["devtools.timeline"],
    });
    await page.evaluate(() => window.__perf.reset());

    // ── 드래그: 창 폭을 STEP px 씩 축소
    for (let w = START_WIDTH; w >= END_WIDTH; w -= STEP) {
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { width: w },
      });
      await page.waitForTimeout(STEP_DELAY);
    }

    // ── 손 놓고 대기 (디바운스 커밋 반영 — 안 기다리면 마지막 커밋 누락)
    await page.waitForTimeout(SETTLE_MS);

    const dump = await page.evaluate(() => window.__perf.dump());
    await browser.stopTracing();

    const listenersAfter = await getListeners(cdp);

    // 스로틀 해제 (rate: 1 이 정상, 0 아님)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    return { run: runIndex, ...dump, listenersBefore, listenersAfter };
  } finally {
    await browser.close();
  }
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

// Warmup: 첫 회차 리스너/이벤트 튀는 문제 완화 — 결과에는 포함 안 함
for (let i = 0; i < WARMUP_RUNS; i++) {
  console.log(`\n── ${LABEL} warmup ${i + 1}/${WARMUP_RUNS} (버림) ─────────────`);
  await runOnce(`warmup-${i + 1}`);
}

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
  ["total actualDuration (ms)", (r) => pick(r, "totalDuration")],
  ["max actualDuration (ms)", (r) => pick(r, "maxDuration")],
  ["viewport.set 호출", (r) => pick(r, "viewport.set")],
  ["window.setPos 호출", (r) => pick(r, "window.setPos")],
  ["JS event listeners (측정 후)", (r) => r.listenersAfter],
];

let md = `# ${LABEL} 측정 결과\n\n`;
md += `- 측정일: ${new Date().toISOString()}\n`;
md += `- 스로틀 ${THROTTLE}× · 창 ${EXPECTED_WINDOWS}개 · 드래그 ${START_WIDTH}→${END_WIDTH}px (${STEP}px step, ${STEP_DELAY}ms) · 대기 ${SETTLE_MS}ms · fixture 지연 ${NET_DELAY}ms\n\n`;
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

// ─────────────── 자가점검표 ───────────────
// 창 프레임(스크롤바 등)으로 innerWidth 가 몇 px 어긋날 수 있어 5px 허용
const widthConsistent = results.every(
  (r) =>
    Math.abs(r.startW - START_WIDTH) <= 5 &&
    Math.abs(r.endW - END_WIDTH) <= 5
);
const resizeMed = median(results.map((r) => r.resizeEvents));
const viewportSetTotal = results.reduce(
  (s, r) => s + (r.counts?.["viewport.set"] ?? 0),
  0
);
const windowSetPosTotal = results.reduce(
  (s, r) => s + (r.counts?.["window.setPos"] ?? 0),
  0
);
const resizeTotal = results.reduce((s, r) => s + (r.resizeEvents ?? 0), 0);
const viewportPerEvent = resizeTotal ? viewportSetTotal / resizeTotal : 0;
const setPosPerEvent = resizeTotal ? windowSetPosTotal / resizeTotal : 0;
const listenersMed = median(results.map((r) => r.listenersAfter));

const mark = (ok) => (ok ? "✓" : "⚠");
const checks = [
  {
    name: "startW / endW 3회 동일",
    expected: `${START_WIDTH} / ${END_WIDTH}`,
    got: results.map((r) => `${r.startW}/${r.endW}`).join(", "),
    ok: widthConsistent,
    hint: "창 최대화 또는 해상도 초과",
  },
  {
    name: "resizeEvents 중앙값",
    expected: `${EXPECT_RESIZE_MIN}~${EXPECT_RESIZE_MAX}`,
    got: fmt(resizeMed),
    ok:
      resizeMed != null &&
      resizeMed >= EXPECT_RESIZE_MIN &&
      resizeMed <= EXPECT_RESIZE_MAX,
    hint: "수십 회면 스로틀 미적용 (rate:4 확인)",
  },
  {
    name: `viewport.set / resize (${LABEL === "after" ? "리프팅 후 1 기대" : `창 개수 ${EXPECTED_WINDOWS} 기대`})`,
    expected: `${EXPECTED_VIEWPORT_RATIO}`,
    got: viewportPerEvent.toFixed(2),
    ok: Math.abs(viewportPerEvent - EXPECTED_VIEWPORT_RATIO) < 0.5,
    hint:
      viewportPerEvent < EXPECTED_VIEWPORT_RATIO
        ? "SETTLE_MS 부족 가능성 — 마지막 커밋이 dump 전에 안 잡힘"
        : "카운터 위치 확인 (리프팅 여부 재확인)",
  },
  {
    name: `window.setPos / resize (기대 ${EXPECTED_SETPOS_RATIO})`,
    expected: `${EXPECTED_SETPOS_RATIO}`,
    got: setPosPerEvent.toFixed(2),
    ok: Math.abs(setPosPerEvent - EXPECTED_SETPOS_RATIO) < 0.5,
    hint:
      setPosPerEvent < EXPECTED_SETPOS_RATIO
        ? "SETTLE_MS 부족 가능성"
        : "카운터 위치 확인",
  },
  {
    name: "JSEventListeners 중앙값",
    expected: `${EXPECT_LISTENERS_MIN}~${EXPECT_LISTENERS_MAX}`,
    got: fmt(listenersMed),
    ok:
      listenersMed != null &&
      listenersMed >= EXPECT_LISTENERS_MIN &&
      listenersMed <= EXPECT_LISTENERS_MAX,
    hint: "범위 밖이면 창 구성 또는 측정 환경 변경 여부 확인",
  },
];

md += `\n## 자가 점검\n\n`;
md += `| 항목 | 기대 | 관측 | 결과 | 힌트 |\n`;
md += `|---|---|---|---|---|\n`;
for (const c of checks) {
  md += `| ${c.name} | ${c.expected} | ${c.got} | ${mark(c.ok)} | ${
    c.ok ? "" : c.hint
  } |\n`;
}

fs.writeFileSync(path.join(OUT_DIR, "summary.md"), md);
console.log("\n" + md);
console.log(`→ ${OUT_DIR}/summary.md`);
