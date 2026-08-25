import { z } from "zod";

/**
 * Zod 스키마를 Gemini 구조화 출력(responseJsonSchema)이 받아주는 JSON Schema로 옮긴다.
 *
 * 액션 정의(types/ai-actions.ts) 하나에서 모델에게 줄 형식과 응답 검증이 모두 나오게 하려고
 * 손으로 쓰지 않고 변환한다. Gemini의 responseJsonSchema는 표준 JSON Schema를 받지만
 * 전부는 아니고 다음만 지원한다:
 *   $id, $defs, $ref, $anchor, type, format, title, description, enum, items,
 *   prefixItems, minItems, maxItems, minimum, maximum, anyOf, oneOf, properties,
 *   additionalProperties, required, propertyOrdering
 *
 * 그래서 두 가지를 손본다.
 * - const → enum: z.literal이 만드는 const는 지원 목록에 없다. 값 하나짜리 enum으로 바꾼다.
 * - pattern 제거: 문자열 정규식 제약은 지원하지 않는다.
 *
 * pattern을 못 싣는다는 건 ref 형식 검사가 모델 쪽에서 강제되지 않는다는 뜻이고,
 * 그래서 ref 검증은 반드시 코드 쪽에 있어야 한다(utils/ai-action-validate.ts).
 */

/** responseJsonSchema가 지원하지 않는 키워드 */
const UNSUPPORTED_KEYWORDS = ["pattern", "$schema"] as const;

type JsonSchemaNode = Record<string, unknown>;

const isNode = (value: unknown): value is JsonSchemaNode =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalize = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(normalize);
  if (!isNode(node)) return node;

  const next: JsonSchemaNode = {};
  for (const [key, value] of Object.entries(node)) {
    if ((UNSUPPORTED_KEYWORDS as readonly string[]).includes(key)) continue;
    if (key === "const") {
      next.enum = [value];
      continue;
    }
    next[key] = normalize(value);
  }
  return next;
};

export const toGeminiJsonSchema = (schema: z.ZodType): JsonSchemaNode =>
  normalize(z.toJSONSchema(schema, { io: "input" })) as JsonSchemaNode;
