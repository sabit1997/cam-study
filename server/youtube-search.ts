import { ApiError, GoogleGenAI } from "@google/genai";
import {
  parseGeminiQuotaError,
  quotaMessage,
  type QuotaExhaustionKind,
} from "./gemini-quota";

/**
 * Gemini 그라운딩 검색으로 유튜브 강의 후보를 뽑는다.
 *
 * ## 왜 YouTube Data API가 아니라 Gemini 그라운딩인가
 * - Google Search 그라운딩은 Gemini SDK에 내장돼 있어 별도 API 키가 필요 없다.
 * - YouTube Data API로 검색해서 얻는 것은 제목·설명·조회수. 강의성/광고성 판단은 못 한다.
 *   그라운딩 뒤에 LLM에게 "강의성 우선, 광고 배제" 힌트를 주면 그 판단이 함께 이뤄진다.
 * - 검색 결과 URL은 실재하는 유튜브 페이지에서 나온다 — LLM이 지어낼 여지가 없다.
 *
 * ## 승인 전 임베드 검사가 왜 여기가 아니라 오케스트레이터에 있는가
 * - 검색과 임베드 검사는 서로 다른 실패 지점을 갖는다. 여기서 묶으면 두 실패가 하나로 뭉친다.
 * - 오케스트레이터(utils/youtube-pipeline.ts)가 두 단계를 이어붙여 승인 패널에 통과분만 넘긴다.
 */

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const MAX_COUNT = 8;
const DEFAULT_COUNT = 3;

const SEARCH_SYSTEM_PROMPT = `당신은 CamStudy에서 사용자의 공부 목적에 맞는 YouTube 영상 후보를 찾아주는 도우미입니다.

# 원칙
- Google Search 도구로 실제 YouTube URL을 찾아 반환합니다. URL을 지어내지 마세요.
- 강의·해설·튜토리얼을 우선하세요. 홍보 영상·쇼츠·라이브 조각·개인 브이로그는 배제하세요.
- 조회수보다는 강의성이 중요합니다.
- 반환할 필드: videoId(11자), title, channel.

# 반환 형식 (JSON만, 다른 텍스트 없이)
{ "candidates": [{ "videoId": "...", "title": "...", "channel": "..." }] }

후보를 못 찾으면 빈 배열을 반환하세요. 잘못된 결과보다 침묵이 낫습니다.`;

export interface SearchCandidate {
  videoId: string;
  title: string;
  channel: string;
}

export interface SearchRequest {
  query: string;
  count?: number;
}

export type SearchResult =
  | { ok: true; candidates: SearchCandidate[] }
  | {
      ok: false;
      status: number;
      error: string;
      /** 429일 때 소진 종류. ai-interpret.ts InterpretResult와 같은 스키마. */
      reason?: QuotaExhaustionKind;
      retryAfterSec?: number;
    };

/** 테스트에서 갈아끼우기 위한 좁은 인터페이스. server/ai-interpret.ts와 같은 패턴. */
export interface SearchGenerateResult {
  text?: string;
  candidates?: Array<{ finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}
export type SearchGenerateContent = (params: {
  model: string;
  contents: string;
  config: Record<string, unknown>;
}) => Promise<SearchGenerateResult>;

export interface SearchOptions {
  generateContent?: SearchGenerateContent;
  apiKey?: string;
  model?: string;
}

let cachedClient: GoogleGenAI | null = null;
const defaultGenerateContent = (apiKey?: string): SearchGenerateContent => {
  if (!cachedClient) cachedClient = new GoogleGenAI(apiKey ? { apiKey } : {});
  return (params) => cachedClient!.models.generateContent(params);
};

/**
 * videoId는 11자 영숫자·언더스코어·하이픈. 정규식으로 재검증해서
 * LLM이 잘못된 형식을 반환해도 그대로 흘려보내지 않는다.
 */
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const parseCandidates = (raw: string): SearchCandidate[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !("candidates" in parsed)) return [];
  const arr = (parsed as { candidates: unknown }).candidates;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item): SearchCandidate | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const videoId = typeof record.videoId === "string" ? record.videoId : null;
      const title = typeof record.title === "string" ? record.title : null;
      const channel = typeof record.channel === "string" ? record.channel : "";
      if (!videoId || !title) return null;
      if (!VIDEO_ID_REGEX.test(videoId)) return null;
      return { videoId, title, channel };
    })
    .filter((c): c is SearchCandidate => c !== null);
};

const dedupeByVideoId = (
  candidates: SearchCandidate[]
): SearchCandidate[] => {
  const seen = new Set<string>();
  const out: SearchCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.videoId)) continue;
    seen.add(c.videoId);
    out.push(c);
  }
  return out;
};

export const searchYoutube = async (
  input: unknown,
  options: SearchOptions = {}
): Promise<SearchResult> => {
  if (!input || typeof input !== "object") {
    return { ok: false, status: 400, error: "요청 형식이 잘못됐습니다." };
  }
  const req = input as Partial<SearchRequest>;
  const query = typeof req.query === "string" ? req.query.trim() : "";
  if (!query) {
    return { ok: false, status: 400, error: "검색어를 입력해주세요." };
  }
  if (query.length > 200) {
    return { ok: false, status: 400, error: "검색어는 200자를 넘을 수 없습니다." };
  }
  const rawCount = typeof req.count === "number" ? req.count : DEFAULT_COUNT;
  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(rawCount)));

  const generateContent =
    options.generateContent ?? defaultGenerateContent(options.apiKey);

  const request = {
    model: options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL,
    contents: `검색어: ${query}\n원하는 후보 개수: ${count}`,
    config: {
      systemInstruction: SEARCH_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      // 그라운딩 검색 도구. Gemini SDK가 실제 검색을 수행하고 결과를 모델에 넣는다.
      tools: [{ googleSearch: {} }],
      // 검색·필터링·JSON 정리까지 다단계라서 MINIMAL은 조기 종료 위험. MEDIUM으로.
      thinkingConfig: { thinkingLevel: "MEDIUM" },
    },
  };

  let response: SearchGenerateResult;
  try {
    response = await generateContent(request);
  } catch (error) {
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
      console.error("[youtube-search] API 오류", error.status, error.message);
      return { ok: false, status: 502, error: "AI 응답을 받지 못했습니다." };
    }
    console.error("[youtube-search] 알 수 없는 오류", error);
    return { ok: false, status: 500, error: "AI 응답을 받지 못했습니다." };
  }

  if (response.promptFeedback?.blockReason) {
    return { ok: false, status: 422, error: "이 요청은 처리할 수 없습니다." };
  }
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === "SAFETY" || finishReason === "RECITATION") {
    return { ok: false, status: 422, error: "이 요청은 처리할 수 없습니다." };
  }

  const raw = response.text ?? "";
  const parsed = parseCandidates(raw);
  return { ok: true, candidates: dedupeByVideoId(parsed).slice(0, count) };
};
