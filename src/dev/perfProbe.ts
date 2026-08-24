/// <reference types="vite/client" />

/**
 * 측정 프로브 — 리사이즈 등 특정 구간의 렌더 성능을 계측한다.
 *
 * 사용법:
 *   import { onRenderProbe } from "@/src/dev/perfProbe";
 *   <React.Profiler id="CameraView" onRender={onRenderProbe}>
 *     <CameraView />
 *   </React.Profiler>
 *
 * 콘솔에서:
 *   __perf.reset()  → 지금부터 창을 드래그하며 측정 시작
 *   __perf.dump()   → 지금까지 기록된 결과를 표로 출력
 *
 * 자동으로 기록되는 것:
 *   - 이벤트 수 / 커밋 수 / 커밋÷이벤트 — Before는 1.0 근처, After는 0.05 이하가 목표
 *   - 총·최대 렌더 시간
 *   - 시작→끝 폭(px), 드래그 초 — 손으로 시간을 세지 않아도 조건이 자동 기록된다
 */

// ① 수집
const buckets: Record<string, { commits: number; actuals: number[] }> = {};
let events = 0;
let firstAt = 0;
let lastAt = 0;
let startW = 0;

export function onRenderProbe(id: string, phase: string, actual: number) {
  if (phase === "mount") return; // 첫 마운트는 리사이즈와 무관

  const b = (buckets[id] ??= { commits: 0, actuals: [] });
  b.commits += 1;
  b.actuals.push(actual);
}

function reset() {
  Object.keys(buckets).forEach((k) => delete buckets[k]);
  events = 0;
  firstAt = 0;
  lastAt = 0;
  startW = window.innerWidth;
  console.log("[perf] reset — 지금부터 창을 드래그하세요");
}

// ② 출력
function dump() {
  const sec = events > 1 ? (lastAt - firstAt) / 1000 : 0;
  console.log(
    `[perf] ${startW}→${window.innerWidth}px` +
      ` | resize ${events}회 | ${sec.toFixed(2)}초`,
  );
  console.table(
    Object.entries(buckets).map(([id, b]) => ({
      id,
      commits: b.commits,
      "커밋/이벤트": +(b.commits / (events || 1)).toFixed(2),
      "total ms": +b.actuals.reduce((s, v) => s + v, 0).toFixed(1),
      "max ms": +Math.max(...b.actuals, 0).toFixed(2),
    })),
  );
}

// ③ 전역 등록 (dev 모드에서만)
if (import.meta.env.DEV) {
  window.addEventListener("resize", () => {
    const now = performance.now();
    if (events === 0) firstAt = now;
    lastAt = now;
    events += 1;
  });

  (window as unknown as { __perf: { reset: typeof reset; dump: typeof dump } }).__perf = {
    reset,
    dump,
  };
}
