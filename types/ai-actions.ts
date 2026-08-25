import { z } from "zod";

/**
 * AI가 할 수 있는 일의 전부.
 *
 * 이 파일이 안전 경계다. 여기 없는 것은 AI가 뭐라고 하든 아무 일도 일어나지 않는다.
 * "이 AI가 뭘 할 수 있죠?"라는 질문에 코드 전체를 뒤지지 않고 이 파일 하나로 답할 수 있어야 한다.
 *
 * 프롬프트 / 검증 규칙 / 승인 UI 문장 / 테스트 픽스처 / 실행 registry가 전부 여기서 파생된다.
 */

/**
 * AI가 만들 수 있는 창 종류.
 *
 * TypeList(types/dto.ts)에는 "camera"와 "none"도 있지만 의도적으로 제외했다.
 * - camera: 웹캠은 사용자 고유 권한이다. 이 앱은 화면이 디스코드로 중계되는 경우가 많아
 *           AI가 임의로 카메라를 켜면 피해가 크고 되돌리기 어렵다.
 * - none:   실제 위젯이 아니다.
 * 창 타입 목록을 그대로 넘기지 않고 명시적으로 나열했기 때문에 이 판단을 할 기회가 생겼다.
 */
export const AI_WIDGETS = ["todo", "timer", "youtube", "window"] as const;
export type AiWidget = (typeof AI_WIDGETS)[number];

/**
 * ref는 "방금 만든 그 창"을 가리키는 별명이지 실제 창 id가 아니다.
 * AI에게 실제 리소스 id를 다루게 하지 않고 실행 시점에 해석되는 참조만 쓰게 해서,
 * 존재하지 않는 id를 지어내거나 남의 창을 건드리는 것을 구조적으로 막는다.
 * 실제 id로 오해할 여지를 줄이려고 숫자만으로 이루어진 ref는 허용하지 않는다.
 */
const refSchema = z
  .string()
  .regex(/^(?!\d+$)[A-Za-z0-9_-]{1,16}$/, "ref는 1~16자의 영숫자 별명이어야 합니다.")
  .nullish();

/**
 * 스키마는 "모양이 맞는가"만 본다. "값이 말이 되는가"는 여기서 검사하지 않는다.
 * 포모도로 9999분도 스키마 입장에서는 완벽하게 유효한 정수다.
 * 값의 타당성은 utils/ai-action-validate.ts(2단계 검증)가 맡는다.
 *
 * 이건 취향이 아니라 제약이기도 하다. LLM 구조화 출력이 받는 JSON Schema는
 * minimum/maximum 같은 수치 제약을 지원하지 않아서, 범위 검사는 반드시 코드 쪽에 있어야 한다.
 */
export const aiActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("CREATE_WINDOW"),
    widget: z.enum(AI_WIDGETS),
    ref: refSchema,
  }),
  z.strictObject({
    type: z.literal("ADD_TODO"),
    ref: refSchema,
    text: z.string(),
  }),
  z.strictObject({
    type: z.literal("PLAY_YOUTUBE"),
    ref: refSchema,
    url: z.string(),
  }),
  z.strictObject({
    type: z.literal("START_POMODORO"),
    workMins: z.number().int(),
    breakMins: z.number().int(),
  }),
  z.strictObject({
    type: z.literal("START_STOPWATCH"),
  }),
  // 기록 질의 액션. LLM은 조회 함수를 부르지 못하고, 이 액션 JSON만 반환한다.
  // 실제 조회는 클라이언트의 러너가 utils/ai-record-query를 통해 수행한다.
  // 날짜는 YYYY-MM-DD 문자열. 상대 표현("지난주 화요일")의 해석은 LLM 담당.
  z.strictObject({
    type: z.literal("GET_TOTAL"),
    from: z.string(),
    to: z.string(),
  }),
  z.strictObject({
    type: z.literal("GET_BY_CATEGORY"),
    from: z.string(),
    to: z.string(),
  }),
  z.strictObject({
    type: z.literal("GET_DISTRACT_PATTERN"),
    from: z.string(),
    to: z.string(),
    groupBy: z.enum(["day", "weekday", "hour"]),
  }),
]);

/** 액션은 항상 배치(배열) 단위로 만들어지고, 검증되고, 실행된다. */
export const aiActionBatchSchema = z.array(aiActionSchema);

export type AiAction = z.infer<typeof aiActionSchema>;
export type AiActionType = AiAction["type"];

/** ref를 가질 수 있는 액션만 좁히기 위한 헬퍼 (실행기에서 사용) */
export type AiActionWithRef = Extract<AiAction, { ref?: string | null }>;
