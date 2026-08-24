// src/dev/perfProbe.ts
const buckets: Record<string, { commits: number; actuals: number[] }> = {};
const counts: Record<string, number> = {};
let events = 0,
  firstAt = 0,
  lastAt = 0,
  startW = 0;

const PRIMARY_ID = "App"; // <Profiler id="App"> 와 일치시킬 것

export interface PerfDump {
  startW: number;
  endW: number;
  resizeEvents: number;
  seconds: number;
  commitCount: number;
  totalDuration: number;
  maxDuration: number;
  counts: Record<string, number>;
  byId: Record<string, { commits: number; total: number; max: number }>;
}

declare global {
  interface Window {
    __perf?: {
      reset: () => void;
      dump: () => PerfDump;
      count: (k: string) => void;
    };
  }
  // globalThis.__perf 접근용 — window prop 이 글로벌 window 를 shadow 하는 곳에서 사용
  var __perf: Window["__perf"];
}

export function onRenderProbe(id: string, phase: string, actual: number) {
  if (phase === "mount") return;
  const b = (buckets[id] ??= { commits: 0, actuals: [] });
  b.commits += 1;
  b.actuals.push(actual);
}

// ★ 추가 — setState 호출 지점에서 부를 카운터
export function count(k: string) {
  counts[k] = (counts[k] ?? 0) + 1;
}

function reset() {
  Object.keys(buckets).forEach((k) => delete buckets[k]);
  Object.keys(counts).forEach((k) => delete counts[k]); // ★ 카운터도 비운다
  events = 0;
  firstAt = 0;
  lastAt = 0;
  startW = window.innerWidth;
  console.log("[perf] reset — 지금부터 창을 드래그하세요");
}

function dump(): PerfDump {
  const sec = events > 1 ? (lastAt - firstAt) / 1000 : 0;

  const byId: PerfDump["byId"] = {};
  for (const [id, b] of Object.entries(buckets)) {
    byId[id] = {
      commits: b.commits,
      total: +b.actuals.reduce((s, v) => s + v, 0).toFixed(1),
      max: +b.actuals.reduce((m, v) => (v > m ? v : m), 0).toFixed(2),
    };
  }

  // 주 지표는 PRIMARY_ID 기준, 없으면 전체 합산으로 폴백
  const p = byId[PRIMARY_ID];
  const commitCount = p
    ? p.commits
    : Object.values(byId).reduce((s, v) => s + v.commits, 0);
  const totalDuration = p
    ? p.total
    : +Object.values(byId)
        .reduce((s, v) => s + v.total, 0)
        .toFixed(1);
  const maxDuration = p
    ? p.max
    : Object.values(byId).reduce((m, v) => (v.max > m ? v.max : m), 0);

  const result: PerfDump = {
    startW,
    endW: window.innerWidth,
    resizeEvents: events,
    seconds: +sec.toFixed(2),
    commitCount,
    totalDuration,
    maxDuration,
    counts: { ...counts },
    byId,
  };

  // 수동 측정용 콘솔 출력은 그대로 유지
  console.log(
    `[perf] ${startW}→${result.endW}px | resize ${events}회 | ${result.seconds}초`
  );
  console.table(
    Object.entries(byId).map(([id, b]) => ({
      id,
      commits: b.commits,
      "커밋/이벤트": +(b.commits / (events || 1)).toFixed(2),
      "total ms": b.total,
      "max ms": b.max,
    }))
  );
  if (Object.keys(counts).length) console.table(counts);

  return result; // ★ 이 한 줄이 자동화의 전부
}

if (import.meta.env.DEV) {
  window.addEventListener("resize", () => {
    const now = performance.now();
    if (events === 0) firstAt = now;
    lastAt = now;
    events += 1;
  });
  window.__perf = { reset, dump, count };
}
