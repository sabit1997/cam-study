import { describe, expect, it } from "vitest";
import type { Window } from "@/types/windows";
import { WINDOW_DEFAULT_SIZE, buildWindowPayload } from "./window-payload";

const makeWindows = (count: number, zIndexes?: number[]): Window[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    type: "todo" as const,
    x: 0,
    y: 0,
    width: 360,
    height: 480,
    zIndex: zIndexes?.[index] ?? index + 1,
    userId: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
  }));

describe("buildWindowPayload", () => {
  it("창이 하나도 없으면 기준 위치에 zIndex 1로 만든다", () => {
    expect(buildWindowPayload("todo", [])).toEqual({
      type: "todo",
      zIndex: 1,
      x: 100,
      y: 100,
      width: 360,
      height: 480,
    });
  });

  it("zIndex는 현재 최대값 + 1 — 새 창이 맨 앞에 온다", () => {
    const windows = makeWindows(3, [5, 42, 7]);
    expect(buildWindowPayload("timer", windows).zIndex).toBe(43);
  });

  it("창이 늘어날수록 계단식으로 어긋나게 배치한다", () => {
    expect(buildWindowPayload("todo", makeWindows(1))).toMatchObject({ x: 148, y: 128 });
    expect(buildWindowPayload("todo", makeWindows(2))).toMatchObject({ x: 196, y: 156 });
  });

  it("창 12개마다 계단식 위치가 처음으로 돌아간다", () => {
    const first = buildWindowPayload("todo", makeWindows(0));
    const wrapped = buildWindowPayload("todo", makeWindows(12));
    expect(wrapped.x).toBe(first.x);
    expect(wrapped.y).toBe(first.y);
    // 위치는 순환해도 zIndex는 계속 올라가므로 새 창이 뒤에 숨지 않는다
    expect(wrapped.zIndex).toBeGreaterThan(first.zIndex);
  });

  it("위젯 타입별 기본 크기를 적용한다", () => {
    for (const [type, size] of Object.entries(WINDOW_DEFAULT_SIZE)) {
      const payload = buildWindowPayload(type as keyof typeof WINDOW_DEFAULT_SIZE, []);
      expect({ width: payload.width, height: payload.height }).toEqual(size);
    }
  });
});
