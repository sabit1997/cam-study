import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { aiActionSchema, type AiAction } from "../types/ai-actions";
import { toGeminiJsonSchema } from "./gemini-schema";
import { SYSTEM_PROMPT } from "./ai-prompt";

/**
 * 자연어 명령 → 액션 배열.
 *
 * 이 함수는 프레임워크를 모른다. Vite 개발 미들웨어와 Vercel 서버리스 함수가
 * 각각 얇은 어댑터로 감싸 쓴다. (check-youtube가 세 곳에 복붙된 전철을 밟지 않기 위해서다.)
 *
 * 여기서 하는 검증은 1단계(모양)까지다. 값이 말이 되는지는 실제로 실행하는 쪽,
 * 즉 브라우저의 AiActionRunner가 utils/ai-action-validate로 다시 확인한다.
 * 액션이 실행되는 지점이 하나이므로 안전 경계도 거기 하나면 된다.
 *
 * 모델을 바꾸려면 이 파일 하나만 고치면 된다. 액션 정의·검증·계획·실행기·팔레트는
 * 어느 회사 모델을 쓰는지 전혀 모른다.
 */

/**
 * 무료 티어에서 쓸 수 있는 모델. `GEMINI_MODEL` 환경변수로 덮어쓸 수 있다.
 *
 * 실측으로 고른 값이다.
 * - gemini-2.5-flash : 신규 사용자에게 제공 종료(404)
 * - gemini-3.7-flash : 503 "high demand"가 6회 중 4회 — 쓸 수 없음
 * - gemini-3.6-flash : 동작하지만 "스톱워치 켜줘" 같은 짧은 단일 명령에 빈 배열을 반환했고,
 *                      무관한 질문에 29초까지 걸렸다
 * - gemini-3.5-flash-lite : 짧은 명령·복잡한 명령·거부 케이스 모두 정확하고 1~2초로 일정하다
 *
 * 명령 해석은 어려운 추론이 아니라 짧은 구조 변환이라, 큰 모델이 더 나은 작업이 아니었다.
 */
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

/**
 * 호출 목적. thinkingLevel과 클라이언트 quota 가중치 분기에 쓰인다.
 *
 * - command / record-query / label-suggest : 짧은 구조 변환. MINIMAL로 지연을 낮춘다.
 * - youtube-search / video-analyze : 다단계 도구 사용 · 영상 파싱. MINIMAL은 조기 종료 위험이 있어 MEDIUM.
 */
export const PURPOSES = [
  "command",
  "record-query",
  "label-suggest",
  "youtube-search",
  "video-analyze",
] as const;
export type Purpose = (typeof PURPOSES)[number];

const THINKING_BY_PURPOSE: Record<Purpose, "MINIMAL" | "LOW" | "MEDIUM"> = {
  command: "MINIMAL",
  "record-query": "MINIMAL",
  "label-suggest": "MINIMAL",
  "youtube-search": "MEDIUM",
  "video-analyze": "MEDIUM",
};

export const DEFAULT_PURPOSE: Purpose = "command";

export const isPurpose = (value: unknown): value is Purpose =>
  typeof value === "string" && (PURPOSES as readonly string[]).includes(value);

/** 503(일시적 과부하)은 재시도하면 대개 통과한다. 429(할당량)는 재시도하면 더 나빠지므로 하지 않는다. */
const RETRY_ON_503 = 1;
const RETRY_DELAY_MS = 700;

/** 사용자 입력 길이 상한 — 프롬프트 주입용 장문 입력과 토큰 낭비를 막는다 */
export const MAX_INPUT_LENGTH = 500;

const responseSchema = z.object({ actions: z.array(aiActionSchema) });

/** 모델에게 넘길 형식과 응답을 검증할 스키마가 같은 정의에서 나온다 */
const RESPONSE_JSON_SCHEMA = toGeminiJsonSchema(responseSchema);

export type InterpretResult =
  | { ok: true; actions: AiAction[] }
  | { ok: false; status: number; error: string };

/** 테스트에서 갈아끼울 수 있도록, 실제로 필요한 부분만 좁게 정의한다 */
export interface GenerateResult {
  text?: string;
  candidates?: Array<{ finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}
export type GenerateContent = (params: {
  model: string;
  contents: string;
  config: Record<string, unknown>;
}) => Promise<GenerateResult>;

export interface InterpretOptions {
  generateContent?: GenerateContent;
  apiKey?: string;
  model?: string;
  /** 호출 목적. thinkingLevel이 이 값으로 분기된다. 기본값은 "command". */
  purpose?: Purpose;
}

let cachedClient: GoogleGenAI | null = null;
const defaultGenerateContent = (apiKey?: string): GenerateContent => {
  if (!cachedClient) cachedClient = new GoogleGenAI(apiKey ? { apiKey } : {});
  return (params) => cachedClient!.models.generateContent(params);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const callWithRetry = async (
  generateContent: GenerateContent,
  request: Parameters<GenerateContent>[0]
): Promise<GenerateResult> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await generateContent(request);
    } catch (error) {
      const retriable =
        error instanceof ApiError && error.status === 503 && attempt < RETRY_ON_503;
      if (!retriable) throw error;
      await sleep(RETRY_DELAY_MS);
    }
  }
};

export const interpret = async (
  input: unknown,
  options: InterpretOptions = {}
): Promise<InterpretResult> => {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false, status: 400, error: "명령을 입력해주세요." };
  }
  const text = input.trim();
  if (text.length > MAX_INPUT_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `명령은 ${MAX_INPUT_LENGTH}자를 넘을 수 없습니다.`,
    };
  }

  const generateContent =
    options.generateContent ?? defaultGenerateContent(options.apiKey);

  const purpose = options.purpose ?? DEFAULT_PURPOSE;
  const thinkingLevel = THINKING_BY_PURPOSE[purpose];

  // "오늘"·"지난주 화요일" 같은 상대 날짜를 해석할 수 있도록 오늘 날짜를 앞머리에 주입.
  // 프롬프트에 하드코딩하면 배포 시점의 날짜로 굳으므로, 매 요청마다 서버가 오늘을 채운다.
  // 서버 UTC와 사용자 로컬이 자정 근처에서 하루 차이가 날 수 있는 트레이드오프가 있지만
  // 사용자가 사후에 명시적 날짜를 넣어 다시 물을 수 있어 실제 사용에서는 큰 문제가 아니다.
  const today = new Date().toISOString().slice(0, 10);
  const contents = `[오늘: ${today}]\n${text}`;

  const request = {
    model: options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL,
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      thinkingConfig: { thinkingLevel },
    },
  };

  let response: GenerateResult;
  try {
    response = await callWithRetry(generateContent, request);
  } catch (error) {
    if (error instanceof ApiError) {
      // 429는 그대로 넘긴다. 무료 티어는 분당 요청 수 제한이 낮아서 실제로 자주 만난다.
      if (error.status === 429) {
        return {
          ok: false,
          status: 429,
          error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
        };
      }
      if (error.status === 401 || error.status === 403) {
        return { ok: false, status: 500, error: "AI API 키가 올바르지 않습니다." };
      }
      if (error.status === 503) {
        // 재시도까지 했는데도 안 됐다. 사용자에게는 다시 눌러보라고 알려주는 게 정확하다.
        return {
          ok: false,
          status: 503,
          error: "AI 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.",
        };
      }
      console.error("[ai-interpret] API 오류", error.status, error.message);
      return { ok: false, status: 502, error: "AI 응답을 받지 못했습니다." };
    }
    console.error("[ai-interpret] 알 수 없는 오류", error);
    return { ok: false, status: 500, error: "AI 응답을 받지 못했습니다." };
  }

  // 본문을 읽기 전에 차단·중단 여부부터 본다. 차단된 응답은 text가 비어 있다.
  if (response.promptFeedback?.blockReason) {
    return { ok: false, status: 422, error: "이 요청은 처리할 수 없습니다." };
  }
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === "SAFETY" || finishReason === "RECITATION") {
    return { ok: false, status: 422, error: "이 요청은 처리할 수 없습니다." };
  }
  if (finishReason === "MAX_TOKENS") {
    return {
      ok: false,
      status: 502,
      error: "AI 응답이 중간에 끊겼습니다. 더 짧게 말해주세요.",
    };
  }

  const raw = response.text;
  if (!raw) {
    return { ok: false, status: 502, error: "AI가 빈 응답을 보냈습니다." };
  }

  // 스키마를 강제했더라도 코드 쪽에서 한 번 더 확인한다.
  // 제공사마다 지원 범위가 다르고, 생성이 중간에 끊기면 그 보장은 무효가 된다.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, status: 502, error: "AI 응답을 이해하지 못했습니다." };
  }

  const parsed = responseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.error("[ai-interpret] 스키마 불일치", parsed.error.issues);
    return { ok: false, status: 502, error: "AI가 실행할 수 없는 형식으로 답했습니다." };
  }

  return { ok: true, actions: parsed.data.actions };
};
