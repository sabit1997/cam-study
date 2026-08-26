import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTimerCommands,
  registerTimerCommands,
  resetTimerBridge,
  waitForTimerCommands,
  type TimerCommands,
} from "./timer-bridge";

const stubCommands = (): TimerCommands => ({
  startPomodoro: vi.fn(() => true),
  startStopwatch: vi.fn(() => true),
});

afterEach(() => {
  resetTimerBridge();
  vi.useRealTimers();
});

describe("timer-bridge", () => {
  it("등록한 창구를 창 id로 찾을 수 있다", () => {
    const commands = stubCommands();
    registerTimerCommands(7, commands);
    expect(getTimerCommands(7)).toBe(commands);
    expect(getTimerCommands(8)).toBeNull();
  });

  it("창마다 따로 등록된다 — 두 번째 타이머 창이 첫 번째를 덮어쓰지 않는다", () => {
    const first = stubCommands();
    const second = stubCommands();
    registerTimerCommands(1, first);
    registerTimerCommands(2, second);
    expect(getTimerCommands(1)).toBe(first);
    expect(getTimerCommands(2)).toBe(second);
  });

  it("등록 해제하면 사라진다", () => {
    const unregister = registerTimerCommands(3, stubCommands());
    unregister();
    expect(getTimerCommands(3)).toBeNull();
  });

  it("리마운트로 새 창구가 들어온 뒤 옛 해제 함수가 늦게 불려도 새 것을 지우지 않는다", () => {
    // React StrictMode·리마운트에서 정리(cleanup)가 새 등록보다 늦게 도는 순서가 실제로 생긴다.
    const stale = stubCommands();
    const fresh = stubCommands();
    const unregisterStale = registerTimerCommands(4, stale);
    registerTimerCommands(4, fresh);
    unregisterStale();
    expect(getTimerCommands(4)).toBe(fresh);
  });

  it("이미 준비된 창은 즉시 돌려준다", async () => {
    const commands = stubCommands();
    registerTimerCommands(5, commands);
    await expect(waitForTimerCommands(5)).resolves.toBe(commands);
  });

  it("아직 마운트되지 않은 창은 등록될 때까지 기다린다", async () => {
    const pending = waitForTimerCommands(6, 1000);
    const commands = stubCommands();
    registerTimerCommands(6, commands);
    await expect(pending).resolves.toBe(commands);
  });

  it("같은 창을 기다리는 쪽이 여럿이어도 모두 깨어난다", async () => {
    const a = waitForTimerCommands(9, 1000);
    const b = waitForTimerCommands(9, 1000);
    const commands = stubCommands();
    registerTimerCommands(9, commands);
    await expect(Promise.all([a, b])).resolves.toEqual([commands, commands]);
  });

  it("시간 안에 준비되지 않으면 거절한다 — 실행기가 이 실패를 사용자에게 보고한다", async () => {
    vi.useFakeTimers();
    const pending = waitForTimerCommands(10, 3000);
    // 거절을 먼저 붙여두지 않으면 unhandled rejection으로 샌다.
    const assertion = expect(pending).rejects.toThrow("준비되지 않았습니다");
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });

  it("타임아웃 뒤 늦게 등록돼도 터지지 않는다", async () => {
    vi.useFakeTimers();
    const pending = waitForTimerCommands(11, 3000);
    const assertion = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
    expect(() => registerTimerCommands(11, stubCommands())).not.toThrow();
  });
});
