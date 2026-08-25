import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toGeminiJsonSchema } from "./gemini-schema";
import { aiActionSchema } from "../types/ai-actions";

const findAll = (node: unknown, key: string): unknown[] => {
  if (Array.isArray(node)) return node.flatMap((item) => findAll(item, key));
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    k === key ? [v] : findAll(v, key)
  );
};

describe("toGeminiJsonSchema", () => {
  const schema = toGeminiJsonSchema(z.object({ actions: z.array(aiActionSchema) }));

  it("지원하지 않는 키워드를 남기지 않는다", () => {
    expect(findAll(schema, "pattern")).toHaveLength(0);
    expect(findAll(schema, "$schema")).toHaveLength(0);
  });

  it("const를 값 하나짜리 enum으로 바꾼다", () => {
    expect(findAll(schema, "const")).toHaveLength(0);
    const enums = findAll(schema, "enum") as unknown[][];
    expect(enums).toContainEqual(["CREATE_WINDOW"]);
    expect(enums).toContainEqual(["START_STOPWATCH"]);
  });

  it("위젯 화이트리스트는 그대로 enum으로 남는다", () => {
    const enums = findAll(schema, "enum") as unknown[][];
    const widgets = enums.find((values) => values.includes("todo"));
    expect(widgets).toEqual(["todo", "timer", "youtube", "window"]);
    // 카메라는 애초에 목록에 없다
    expect(widgets).not.toContain("camera");
  });

  it("액션 5종이 모두 실려 나간다", () => {
    const serialized = JSON.stringify(schema);
    for (const type of [
      "CREATE_WINDOW",
      "ADD_TODO",
      "PLAY_YOUTUBE",
      "START_POMODORO",
      "START_STOPWATCH",
    ]) {
      expect(serialized).toContain(type);
    }
  });

  it("객체 구조(properties/required)는 보존한다", () => {
    expect(findAll(schema, "properties").length).toBeGreaterThan(0);
    expect(findAll(schema, "required").length).toBeGreaterThan(0);
  });
});
