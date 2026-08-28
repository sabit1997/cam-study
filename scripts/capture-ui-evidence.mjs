// scripts/capture-ui-evidence.mjs
// 사용법: node scripts/capture-ui-evidence.mjs <label> [--dist=<경로>]
// 결과: bundle-out/<label>/ui-tooltip.png, ui-evidence.json
//
// measure-bundle.mjs 가 크기를, measure-load-timing.mjs 가 시간을 잰다면
// 이 스크립트는 **줄인 뒤에도 화면이 그대로인가**를 본다.
//
// 번들에서 UI 라이브러리를 걷어내는 작업은 숫자만 보면 항상 이긴다. 지는 쪽은
// 늘 화면이다. radix tooltip 을 직접 구현으로 바꾸면서 실제로 깨질 수 있는 것은
// 두 가지였고, 둘 다 스크린샷이 아니면 확인할 방법이 없다.
//
//   1. 창 컨테이너가 overflow-hidden(window.tsx) 이라 타이틀바 위로 뜨는 툴팁이
//      잘린다. radix 는 Portal 로 피해 갔다.
//   2. 창이 화면 맨 위에 붙으면 툴팁이 뷰포트 밖으로 나간다. radix 는 collision
//      detection 으로 아래로 뒤집는다.
//
// 그래서 창을 둘 띄운다 — 하나는 화면 중간, 하나는 최상단(y=0).
//
// ## 서버를 건드리지 않는다
// 로그인 쿠키를 주입하고 /api/* 를 전부 가로챈다. 실제 백엔드에 요청이 가지 않고
// 테스트 계정의 창 목록도 바뀌지 않는다. 창 구성은 아래 WINDOW_FIXTURE 가 전부다.
//
// 브라우저는 capture-bundle-evidence.mjs 와 같은 이유로 시스템 Chrome 을 쓴다.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const ROOT = path.join(import.meta.dirname, "..");

const LABEL = process.argv[2];
if (!LABEL || LABEL.startsWith("--")) {
  console.error("usage: node scripts/capture-ui-evidence.mjs <label> [--dist=<경로>]");
  process.exit(1);
}
const distArg = (process.argv.find((a) => a.startsWith("--dist=")) ?? "").split("=")[1];

const OUT_DIR = path.join(ROOT, "bundle-out", LABEL);
fs.mkdirSync(OUT_DIR, { recursive: true });

// dist 는 스냅샷을 우선한다. 브랜치를 옮기지 않고 before/after 를 한 세션에서
// 찍으려면 각 라벨의 dist-snapshot 을 서빙해야 한다.
const DIST = distArg
  ? path.resolve(ROOT, distArg)
  : fs.existsSync(path.join(OUT_DIR, "dist-snapshot", "index.html"))
    ? path.join(OUT_DIR, "dist-snapshot")
    : path.join(ROOT, "dist");

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error(`${path.relative(ROOT, DIST)}/index.html 이 없습니다.`);
  process.exit(1);
}

const VIEWPORT = { width: 1400, height: 900 };

// 좌표는 1920×1080 기준으로 저장되고 getPositionScale 로 축소된다(utils/workspace.ts).
// y=0 인 창이 "최상단" 검증용이다 — 툴팁이 뷰포트 위로 나가는 경우.
const WINDOW_FIXTURE = [
  {
    id: 9001,
    type: "todo",
    x: 420,
    y: 260,
    width: 360,
    height: 480,
    zIndex: 1,
    userId: "capture",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: 9002,
    type: "timer",
    x: 1180,
    y: 0,
    width: 320,
    height: 380,
    zIndex: 2,
    userId: "capture",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

/** 타이틀바 버튼에 hover 한 뒤 툴팁이 뜰 때까지 (열림 지연 300ms + 여유) */
const HOVER_SETTLE_MS = 700;

// 어느 빌드를 찍었는지가 체크아웃된 커밋보다 중요하다. 스냅샷을 서빙할 때는
// 그 스냅샷을 뜬 커밋(.meta.json)을 기록해야 라벨과 코드가 어긋나지 않는다.
let head = "(unknown)";
let dirty = false;
try {
  head = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  dirty = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
} catch {
  /* git 없어도 캡처는 계속 */
}
let snapshotMeta = null;
try {
  snapshotMeta = JSON.parse(fs.readFileSync(path.join(DIST, ".meta.json"), "utf8"));
  head = snapshotMeta.commit ?? head;
  dirty = false; // 스냅샷은 clean tree 에서만 떠진다(measure-load-timing.mjs 가 막는다)
} catch {
  /* dist 를 직접 서빙하는 경우 */
}

// ─────────────── 정적 서버 (SPA 폴백) ───────────────
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

/** 백엔드를 대신한다. 실제 요청은 한 건도 나가지 않는다. */
function mockApi(pathname) {
  if (pathname === "/api/windows") return WINDOW_FIXTURE;
  if (/^\/api\/windows\/\d+\/todos$/.test(pathname)) return [];
  if (pathname === "/api/timer/today") {
    return { totalSeconds: 0, dailyHourGoal: 0, pomoCycles: 0 };
  }
  if (pathname === "/api/timer/goal") return { hour: 0 };
  return {};
}

// ─────────────── 캡처 ───────────────
const { server, port } = await serve(DIST);
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ channel: "chrome" });

const findings = [];

try {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    // SW 가 fetch 를 가로채면 아래 route 와 겹친다. 캡처에는 필요 없으니 막는다.
    serviceWorkers: "block",
  });

  // 로그인 상태는 쿠키 하나로 결정된다(stores/user-state.tsx → utils/auth-user.ts).
  await context.addCookies([
    {
      name: "cam-study-user",
      value: encodeURIComponent(JSON.stringify({ userId: 1, username: "capture" })),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  // search 까지 기록한다. 쿼리 문자열 생성기를 바꿀 때(qs → URLSearchParams) 실제
  // 앱이 내보내는 URL 이 같은지가 유닛 테스트 밖에서 확인되는 유일한 지점이다.
  const apiCalls = [];
  await context.route(`${base}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    apiCalls.push(`${route.request().method()} ${url.pathname}${url.search}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockApi(url.pathname)),
    });
  });

  const page = await context.newPage();
  page.on("pageerror", (err) => findings.push({ level: "error", text: `pageerror: ${err.message}` }));

  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("[data-window-id]", { timeout: 20_000 });

  const windowCount = await page.locator("[data-window-id]").count();
  if (windowCount !== WINDOW_FIXTURE.length) {
    findings.push({
      level: "error",
      text: `창 개수 불일치: 기대 ${WINDOW_FIXTURE.length}, 실제 ${windowCount}`,
    });
  }

  // lazy 청크(Todos·Timer)가 마운트될 때까지
  await page.waitForTimeout(1200);

  /**
   * 한 창의 닫기 버튼에 hover 하고, 뜬 툴팁의 기하를 잰다.
   *
   * 판정 두 가지.
   * - escapesClip: 툴팁 상단이 창 상단보다 위에 있는가 → overflow-hidden 을 뚫었는가
   * - insideViewport: 툴팁이 화면 안에 온전히 들어왔는가
   */
  async function hoverAndMeasure(windowId) {
    const win = page.locator(`[data-window-id="${windowId}"]`);
    const closeButton = win.locator("button").first();
    await closeButton.hover();
    await page.waitForTimeout(HOVER_SETTLE_MS);

    return page.evaluate((id) => {
      const winEl = document.querySelector(`[data-window-id="${id}"]`);
      const winRect = winEl?.getBoundingClientRect() ?? null;

      // radix 판과 자체 구현 판 모두 텍스트가 화면에 있는 것으로 찾는다.
      // 선택자에 기대면 두 구현의 DOM 차이 때문에 비교가 성립하지 않는다.
      const candidates = [...document.body.querySelectorAll("*")].filter((el) => {
        if (el.closest(`[data-window-id="${id}"]`)) return false;
        const text = el.textContent?.trim();
        if (text !== "닫기") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      // 가장 안쪽 요소를 고른다(부모도 같은 textContent 를 갖는다)
      const tip = candidates[candidates.length - 1] ?? null;
      const tipRect = tip?.getBoundingClientRect() ?? null;

      return {
        found: Boolean(tipRect),
        tipRect: tipRect && {
          top: Math.round(tipRect.top),
          left: Math.round(tipRect.left),
          width: Math.round(tipRect.width),
          height: Math.round(tipRect.height),
        },
        winTop: winRect ? Math.round(winRect.top) : null,
        escapesClip: Boolean(tipRect && winRect && tipRect.top < winRect.top),
        insideViewport: Boolean(
          tipRect &&
            tipRect.top >= 0 &&
            tipRect.left >= 0 &&
            tipRect.right <= window.innerWidth &&
            tipRect.bottom <= window.innerHeight
        ),
      };
    }, windowId);
  }

  // 화면 중간 창 — overflow-hidden 을 뚫는지
  const mid = await hoverAndMeasure(9001);
  const midShot = path.join(OUT_DIR, "ui-tooltip.png");
  await page.screenshot({ path: midShot });

  // 최상단 창 — 뷰포트 위로 나가지 않는지
  await page.mouse.move(10, 500); // 앞의 툴팁을 먼저 닫는다
  await page.waitForTimeout(300);
  const top = await hoverAndMeasure(9002);
  const topShot = path.join(OUT_DIR, "ui-tooltip-topedge.png");
  await page.screenshot({ path: topShot });

  if (!mid.found) findings.push({ level: "error", text: "중간 창: 툴팁이 뜨지 않았다" });
  else if (!mid.escapesClip) {
    findings.push({
      level: "error",
      text: `중간 창: 툴팁이 창 안에 갇혔다 (tip.top ${mid.tipRect.top} ≥ win.top ${mid.winTop}) — overflow-hidden 에 잘린다`,
    });
  }
  if (!top.found) findings.push({ level: "error", text: "최상단 창: 툴팁이 뜨지 않았다" });
  else if (!top.insideViewport) {
    findings.push({
      level: "warn",
      text: `최상단 창: 툴팁이 뷰포트를 벗어난다 (top ${top.tipRect.top}) — radix 의 collision flip 에 해당하는 처리가 없다`,
    });
  }

  const raw = {
    label: LABEL,
    commit: head,
    dirty,
    snapshotMeta,
    dist: path.relative(ROOT, DIST),
    viewport: VIEWPORT,
    apiCalls,
    mid,
    top,
    findings,
  };
  fs.writeFileSync(path.join(OUT_DIR, "ui-evidence.json"), JSON.stringify(raw, null, 2));

  console.log(`\n[${LABEL}] 커밋 ${head}${dirty ? " (변경 있음)" : ""} · dist ${raw.dist}`);
  console.log(
    `  중간 창   툴팁 ${mid.found ? "뜸" : "안 뜸"} · 창 상단 ${mid.winTop} · 툴팁 상단 ${mid.tipRect?.top ?? "—"} · 클립 탈출 ${mid.escapesClip ? "✓" : "✗"}`
  );
  console.log(
    `  최상단 창 툴팁 ${top.found ? "뜸" : "안 뜸"} · 창 상단 ${top.winTop} · 툴팁 상단 ${top.tipRect?.top ?? "—"} · 뷰포트 안 ${top.insideViewport ? "✓" : "✗"}`
  );
  for (const f of findings) console.log(`  ${f.level === "error" ? "⚠" : "·"} ${f.text}`);
  console.log(`→ ${path.relative(ROOT, midShot)}`);
  console.log(`→ ${path.relative(ROOT, topShot)}`);

  await context.close();
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
