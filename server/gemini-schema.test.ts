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

  it("액션 6종이 모두 실려 나간다", () => {
    const serialized = JSON.stringify(schema);
    for (const type of [
      "CREATE_WINDOW",
      "ADD_TODO",
      "PLAY_YOUTUBE",
      "SEARCH_YOUTUBE",
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

  it("SEARCH_YOUTUBE의 nullish clarify는 anyOf에 null 변형을 갖는다", () => {
    // nullish 필드가 { anyOf: [..., { type: "null" }] } 로 바뀌어야 Gemini
    // responseJsonSchema가 받아들인다. anyOf 자체는 지원 목록에 있어 그대로 남는다.
    // clarify라는 이름을 가진 노드는 SEARCH_YOUTUBE 스키마에만 있으므로 그 노드가 있음을 먼저 확인.
    const clarifyNodes = findAll(schema, "clarify");
    expect(clarifyNodes.length).toBeGreaterThan(0);
    const clarify = clarifyNodes[0];
    const anyOf = (clarify as Record<string, unknown>).anyOf as unknown[];
    expect(Array.isArray(anyOf)).toBe(true);
    // z.nullish()는 z.optional().nullable()과 동치라 anyOf에 { type: "null" }이 반드시 포함된다.
    const hasNull = anyOf.some(
      (variant) =>
        typeof variant === "object" &&
        variant !== null &&
        (variant as Record<string, unknown>).type === "null"
    );
    expect(hasNull).toBe(true);
  });
});
