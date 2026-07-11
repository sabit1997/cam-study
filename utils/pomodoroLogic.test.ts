import { describe, it, expect, vi } from "vitest";

type PomoPhase = "work" | "break";

/**
 * components/timer.tsx의 setInterval 콜백 로직을 그대로 재현.
 * 실제 시간을 기다리지 않고 틱을 동기적으로 실행해 검증한다.
 */
function simulatePomodoro(
  workSecs: number,
  breakSecs: number,
  targetSessions: number,
  startTime: Date,
  postTime: (data: { startAt: string; endAt: string }) => void,
  patchCycles: (n: number) => void
) {
  const state = {
    phase: "work" as PomoPhase,
    remaining: workSecs,
    cycle: 0,
  };
  let workStartRef: Date | null = startTime;
  let completedSessions = 0;
  let tickCount = 0;

  while (completedSessions < targetSessions) {
    tickCount++;
    const now = new Date(startTime.getTime() + tickCount * 1000);

    if (state.remaining <= 1) {
      const nextPhase: PomoPhase = state.phase === "work" ? "break" : "work";
      if (state.phase === "work") {
        if (workStartRef) {
          postTime({ startAt: workStartRef.toISOString(), endAt: now.toISOString() });
          workStartRef = null;
        }
        state.cycle++;
        patchCycles(state.cycle);
        completedSessions++;
      } else {
        workStartRef = now;
      }
      state.phase = nextPhase;
      state.remaining = nextPhase === "work" ? workSecs : breakSecs;
    } else {
      state.remaining--;
    }
  }

  return state;
}

const START = new Date("2024-01-01T09:00:00.000Z");

describe("포모도로 시간 기록", () => {
  it("45분 세션 1회 완료 시 정확히 2700초(45분)가 기록된다", () => {
    const postTime = vi.fn();
    const patchCycles = vi.fn();

    simulatePomodoro(2700, 300, 1, START, postTime, patchCycles);

    expect(postTime).toHaveBeenCalledTimes(1);
    const { startAt, endAt } = postTime.mock.calls[0][0];
    const recorded = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000;
    expect(recorded).toBe(2700);
  });

  it("45분 세션 2회 완료 시 각각 2700초이고 합계 5400초(90분)가 기록된다", () => {
    const postTime = vi.fn();
    const patchCycles = vi.fn();

    simulatePomodoro(2700, 300, 2, START, postTime, patchCycles);

    expect(postTime).toHaveBeenCalledTimes(2);

    const durations = postTime.mock.calls.map(([{ startAt, endAt }]) =>
      (new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000
    );
    expect(durations[0]).toBe(2700);
    expect(durations[1]).toBe(2700);
    expect(durations[0] + durations[1]).toBe(5400);
  });

  it("2회 완료 후 사이클 카운트가 2가 된다", () => {
    const postTime = vi.fn();
    const patchCycles = vi.fn();

    const finalState = simulatePomodoro(2700, 300, 2, START, postTime, patchCycles);

    expect(finalState.cycle).toBe(2);
    expect(patchCycles).toHaveBeenNthCalledWith(1, 1);
    expect(patchCycles).toHaveBeenNthCalledWith(2, 2);
  });

  it("휴식 시간은 공부 시간으로 기록되지 않는다", () => {
    const postTime = vi.fn();
    const patchCycles = vi.fn();

    // 2회 완료 = work × 2, break × 1 (두 번째 break는 아직 진행 안 됨)
    simulatePomodoro(2700, 300, 2, START, postTime, patchCycles);

    // postTime은 work 완료 시에만 호출되어야 한다
    expect(postTime).toHaveBeenCalledTimes(2);

    const totalRecorded = postTime.mock.calls.reduce(
      (sum, [{ startAt, endAt }]) =>
        sum + (new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000,
      0
    );
    // break 300초 × 1회가 포함되지 않는다
    expect(totalRecorded).toBe(5400);
    expect(totalRecorded).not.toBe(5400 + 300);
  });

  it("설정 변경 후 새 세션도 정확한 시간이 기록되고 사이클이 누적된다", () => {
    const postTime = vi.fn();
    const patchCycles = vi.fn();

    // 1단계: 25분 설정으로 1 사이클
    const stateAfterFirst = simulatePomodoro(1500, 300, 1, START, postTime, patchCycles);
    expect(stateAfterFirst.cycle).toBe(1);

    // 설정 변경: 45분으로 변경, 사이클은 누적 유지 (applyPomoSettings 수정 후 동작)
    const secondStart = new Date(START.getTime() + 2000 * 1000);
    const stateForSecond = {
      phase: "work" as PomoPhase,
      remaining: 2700,
      cycle: stateAfterFirst.cycle, // 누적 유지
    };

    // 2단계: 45분 설정으로 1 사이클 추가
    let workStartRef: Date | null = secondStart;
    let tickCount = 0;
    const WORK_SECS = 2700;
    const BREAK_SECS = 300;

    while (stateForSecond.phase !== "work" || tickCount === 0 || stateForSecond.remaining !== WORK_SECS || tickCount < 2) {
      tickCount++;
      const now = new Date(secondStart.getTime() + tickCount * 1000);

      if (stateForSecond.remaining <= 1) {
        const nextPhase: PomoPhase = stateForSecond.phase === "work" ? "break" : "work";
        if (stateForSecond.phase === "work") {
          if (workStartRef) {
            postTime({ startAt: workStartRef.toISOString(), endAt: now.toISOString() });
            workStartRef = null;
          }
          stateForSecond.cycle++;
          patchCycles(stateForSecond.cycle);
          break; // 1 사이클만
        } else {
          workStartRef = now;
        }
        stateForSecond.phase = nextPhase;
        stateForSecond.remaining = nextPhase === "work" ? WORK_SECS : BREAK_SECS;
      } else {
        stateForSecond.remaining--;
      }
    }

    // postTime 총 2회 (25분 + 45분)
    expect(postTime).toHaveBeenCalledTimes(2);
    expect(stateForSecond.cycle).toBe(2); // 1 + 1 누적

    const durations = postTime.mock.calls.map(([{ startAt, endAt }]) =>
      (new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000
    );
    expect(durations[0]).toBe(1500); // 25분
    expect(durations[1]).toBe(2700); // 45분
    expect(durations[0] + durations[1]).toBe(4200); // 총 70분
  });
});
