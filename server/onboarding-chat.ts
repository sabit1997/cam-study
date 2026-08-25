import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  parseGeminiQuotaError,
  quotaMessage,
  type QuotaExhaustionKind,
} from "./gemini-quota";
import { AI_WIDGETS } from "../types/ai-actions";

/**
 * 첫 실행 온보딩용 대화형 어시스턴트.
 *
 * ## 왜 SSE 스트리밍인가
 * ChatGPT·Claude처럼 답이 한 글자씩 나타나야 사용자가 "생각 중"임을 자연스레 느낀다.
 * 정적 로딩 스피너는 왜 오래 걸리는지 알려주지 않고, 사용자를 조바심으로 밀어넣는다.
 * 스트리밍은 진행이 눈에 보이는 유일한 저비용 방법이다.
 *
 * ## 왜 두 파트로 나누나 (자연어 + JSON)
 * Gemini의 구조화 출력(responseJsonSchema)은 스트리밍 중 partial JSON이라 UI에 그대로
 * 못 붙인다. 그래서 규약:
 *   {사용자에게 보여줄 문장}\n---\n{기계용 JSON}
 * 클라이언트는 SEPARATOR를 만나기 전까지의 자연어만 렌더링하고, 스트림이 끝나면
 * 서버가 파싱한 구조화 reply를 마지막 `done` 이벤트로 받는다.
 *
 * ## 어댑터 3종
 * 이 파일은 프레임워크를 모른다. Vite dev 미들웨어·Vercel serverless·Electron Express가
 * 각각 얇은 어댑터로 감싸 SSE 헤더와 write를 담당한다.
 */

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const MAX_INPUT_LENGTH = 500;
const MAX_MESSAGES = 20; // 5턴 대화 기준 + 여유
const SEPARATOR = "\n---\n";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(MAX_INPUT_LENGTH),
});

const requestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(MAX_MESSAGES),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

const windowSpecSchema = z.object({
  widget: z.enum(AI_WIDGETS),
  ref: z.string().max(20).optional(),
  todos: z.array(z.string().min(1).max(80)).max(10).optional(),
});

export type WindowSpec = z.infer<typeof windowSpecSchema>;

const replySchema = z.discriminatedUnion("phase", [
  z.object({
    phase: z.literal("ask"),
  }),
  z.object({
    phase: z.literal("done"),
    windows: z.array(windowSpecSchema).min(1).max(6),
  }),
]);

export type OnboardingReply = z.infer<typeof replySchema>;

const ONBOARDING_SYSTEM_PROMPT = `당신은 CamStudy 첫 실행 사용자를 맞이하는 대화형 어시스턴트입니다.
목표는 "이 사람에게 딱 맞는 창 배치"를 함께 정하는 것입니다.

# 톤
- 부드럽고 짧게. 한 번에 한 가지만 묻습니다.
- 이모지 최대 하나. 격식 없이 반말 아닌 존댓말로.

# 창 개수의 대원칙
- **투두 창은 딱 1개**. 사용자가 여러 개 필요하다고 명시하지 않는 한 늘리지 마세요.
- **타이머 창도 딱 1개**. 뽀모도로·스톱워치는 앱 안에서 전환됩니다.
- **카메라 창은 만들지 않습니다** (웹캠은 사용자가 홈 화면에서 직접 켭니다).
- **유튜브 창은 사용자가 배경 영상·강의를 언급할 때만** 만듭니다.
- **화면 공유 창(window)은 사용자가 참고할 자료가 있다고 언급할 때만** 만듭니다.

# 물어봐야 할 것 (순서·개수는 상황에 맞게)
1. 공부할 때 어떤 걸 들어놓나요? 스터디윗미·강의·조용 (유튜브 창 여부)
2. 오늘/이번 주 할 일을 대략 몇 개 정도 잡고 계세요? (투두 초안)
3. 참고 자료(강의 슬라이드·PDF 등)를 옆에 띄워두는 편인가요? (화면 공유 창 여부)

# 언제 그만 묻고 창을 만드나
- 정보가 충분하다고 판단되면 phase:"done"으로 넘어갑니다.
- 최대 5턴이 상한이지만, 3턴이면 충분한 경우가 대부분입니다. 서두르지 마세요.
- 정보가 부족한데도 done으로 넘어가면 배치가 어긋납니다.

# 응답 형식 (엄격)
매 응답은 반드시 아래 두 파트로 이뤄집니다. 다른 텍스트는 절대 넣지 마세요.

첫 번째 파트: 사용자에게 보여줄 자연어 문장 (질문 또는 완료 안내).
두 번째 파트: 구분자 "\n---\n" 뒤에 JSON 한 줄.

## phase가 "ask"일 때
사용자에게 다음 질문을 던집니다.

응답 예:
'''
웹캠으로 얼굴을 켜놓고 공부하시나요?
---
{"phase":"ask"}
'''

## phase가 "done"일 때
질문을 마치고 창 배치를 확정합니다.
- windows: 만들 창 배열. widget은 ${AI_WIDGETS.join(", ")} 중 하나.
- todos가 있는 창은 widget:"todo"만.
- ref는 짧은 별명(t1, y1 등). 지금은 사용하지 않아도 필수 필드는 아닙니다.

응답 예:
'''
좋아요! 이제 창을 만들어 드릴게요.
---
{"phase":"done","windows":[{"widget":"todo","todos":["React 훅 정리","예제 코드 실습"]},{"widget":"timer"}]}
'''

# 하지 않는 것
- JSON 앞에 어떤 텍스트도 넣지 않습니다 (구분자 앞에는 사용자 문장만).
- 마크다운 코드 블록(백틱)으로 감싸지 않습니다.
- windows 배열이 비어있게 done으로 넘어가지 않습니다.`;

const buildContents = (messages: ChatMessage[]) =>
  messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }],
  }));

export interface StreamResult {
  ok: true;
  /** 파싱된 최종 구조화 리플라이. 파싱 실패 시 null. */
  reply: OnboardingReply | null;
  /** 사용자에게 보여준 자연어 부분 (SEPARATOR 이전). */
  visibleText: string;
}
export interface StreamError {
  ok: false;
  status: number;
  error: string;
  reason?: QuotaExhaustionKind;
  retryAfterSec?: number;
}

/** 테스트용 좁은 인터페이스 — Gemini SDK에 직접 의존하지 않도록. */
export type StreamGenerator = AsyncIterable<{ text?: string }>;
export type StreamGenerate = (params: {
  model: string;
  contents: unknown;
  config: Record<string, unknown>;
}) => Promise<StreamGenerator>;

export interface StreamOptions {
  /** chunk 도착 시 콜백 — SEPARATOR 이후는 호출되지 않는다. */
  onDelta: (text: string) => void;
  generateContentStream?: StreamGenerate;
  apiKey?: string;
  model?: string;
}

let cachedClient: GoogleGenAI | null = null;
const defaultStream = (apiKey?: string): StreamGenerate => {
  if (!cachedClient) cachedClient = new GoogleGenAI(apiKey ? { apiKey } : {});
  const client = cachedClient;
  return (params) =>
    client.models.generateContentStream(
      params as unknown as Parameters<typeof client.models.generateContentStream>[0]
    ) as unknown as Promise<StreamGenerator>;
};

/**
 * 입력을 검증하고, Gemini 스트림을 열어 chunks를 순차 콜백으로 흘리며,
 * 스트림 종료 후 SEPARATOR로 분리해 구조화 reply를 파싱한다.
 */
export const streamOnboardingChat = async (
  input: unknown,
  options: StreamOptions
): Promise<StreamResult | StreamError> => {
  const parsedIn = requestSchema.safeParse(input);
  if (!parsedIn.success) {
    return { ok: false, status: 400, error: "요청 형식이 잘못됐습니다." };
  }
  // 마지막 메시지는 사용자여야 한다 — 어시스턴트가 응답해야 하니까.
  const messages = parsedIn.data.messages;
  if (messages[messages.length - 1].role !== "user") {
    return { ok: false, status: 400, error: "마지막 메시지는 사용자여야 합니다." };
  }

  const generate = options.generateContentStream ?? defaultStream(options.apiKey);

  let stream: StreamGenerator;
  try {
    stream = await generate({
      model: options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL,
      contents: buildContents(messages),
      config: {
        systemInstruction: ONBOARDING_SYSTEM_PROMPT,
        thinkingConfig: { thinkingLevel: "MINIMAL" },
      },
    });
  } catch (error) {
    return classifyError(error);
  }

  let accumulated = "";
  let separatorFound = false;
  let visibleText = "";

  try {
    for await (const chunk of stream) {
      const text = chunk.text ?? "";
      if (!text) continue;
      accumulated += text;

      if (separatorFound) continue;

      // SEPARATOR가 이 chunk를 포함해 처음 발견됐는지 확인
      const sepIdx = accumulated.indexOf(SEPARATOR);
      if (sepIdx === -1) {
        // 아직 못 만남 — 전체 text를 그대로 흘린다
        visibleText += text;
        options.onDelta(text);
      } else {
        // SEPARATOR가 지금 이 chunk 안에서 나타났다. 그 앞부분만 흘린다.
        const before = accumulated.slice(0, sepIdx);
        // 이전까지 흘려보낸 것 = visibleText. 이번에 새로 흘려야 하는 조각 = before.slice(visibleText.length)
        const remaining = before.slice(visibleText.length);
        if (remaining.length > 0) {
          visibleText += remaining;
          options.onDelta(remaining);
        }
        separatorFound = true;
      }
    }
  } catch (error) {
    // 스트림 중간에 API 오류가 났을 수 있다.
    return classifyError(error);
  }

  const reply = parseReply(accumulated);
  return { ok: true, reply, visibleText };
};

const classifyError = (error: unknown): StreamError => {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      const info = parseGeminiQuotaError(error);
      return {
        ok: false,
        status: 429,
        error: quotaMessage(info),
        reason: info.kind,
        ...(info.retryAfterSec !== undefined
          ? { retryAfterSec: info.retryAfterSec }
          : {}),
      };
    }
    if (error.status === 401 || error.status === 403) {
      return { ok: false, status: 500, error: "AI API 키가 올바르지 않습니다." };
    }
    if (error.status === 503) {
      return { ok: false, status: 503, error: "AI 서버가 혼잡합니다. 잠시 후 다시 시도해주세요." };
    }
    return { ok: false, status: 502, error: "AI 응답을 받지 못했습니다." };
  }
  return { ok: false, status: 500, error: "AI 요청 처리에 실패했습니다." };
};

/**
 * SEPARATOR 뒤 JSON 파싱. 모델이 규약을 어겨 JSON이 없거나 깨졌으면 null을 반환하고,
 * caller(UI)가 "다시 시도해 주세요"로 폴백한다. 여기서 예외로 만들지 않는다.
 */
const parseReply = (accumulated: string): OnboardingReply | null => {
  const sepIdx = accumulated.indexOf(SEPARATOR);
  if (sepIdx === -1) return null;
  const raw = accumulated.slice(sepIdx + SEPARATOR.length).trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 모델이 코드 블록으로 감싸는 경우가 있어 백틱 제거를 한 번 시도
    const stripped = raw.replace(/^```(?:json)?\n?|\n?```$/g, "").trim();
    try {
      parsed = JSON.parse(stripped);
    } catch {
      return null;
    }
  }
  const result = replySchema.safeParse(parsed);
  return result.success ? result.data : null;
};

export { SEPARATOR };
