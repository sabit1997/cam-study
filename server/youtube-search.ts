import type { QuotaExhaustionKind } from "./gemini-quota";

/**
 * YouTube Data API v3 search.list로 유튜브 후보를 뽑는다.
 *
 * ## 왜 Gemini 그라운딩에서 Data API로 갈아탔는가
 * - 그라운딩은 검색 결과를 모델 컨텍스트에 넣어줄 뿐 videoId를 모델이 문자열에서
 *   읽어내야 했다. flash-lite급은 이 과정에서 id를 누락하거나 그럴듯하게 지어내
 *   결과가 0~1개로 줄어드는 문제가 있었다.
 * - Data API는 실제 존재하는 videoId만 돌려주고, videoEmbeddable=true를 사전 필터로
 *   걸어 임베드 후처리를 대부분 생략할 수 있다.
 * - 지연이 몇 초 → 수백 ms, LLM quota를 안 태우고 별도 quota(≈100 유닛/일)를 쓴다.
 *
 * ## 임베드 재검사가 오케스트레이터에 남아 있는 이유
 * Data API로 갓 받은 결과는 이미 임베드 가능이지만, 캐시(utils/youtube-cache)에서
 * 꺼낸 오래된 결과는 그 사이 영상이 삭제·비공개로 바뀌었을 수 있다. 오케스트레이터가
 * 소스에 따라 재검사 여부를 판단한다(utils/youtube-pipeline.ts).
 */

const SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const MAX_COUNT = 25;
const DEFAULT_COUNT = 15;
/** count보다 넉넉히 받아 후처리 여유(중복 제거·라이브 필터 등)를 둔다. Data API 한도는 50. */
const REQUEST_BUFFER = 5;

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

/**
 * 테스트에서 실제 네트워크 없이 Data API 응답을 흉내내기 위한 좁은 인터페이스.
 * 응답 파싱은 부호화(HTTP 상태·JSON)를 흡수하려고 status·body를 각각 돌려준다.
 */
export interface SearchApiResponse {
  items?: Array<{
    id?: { videoId?: string; kind?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      liveBroadcastContent?: string;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
}
export type FetchSearch = (params: {
  query: string;
  maxResults: number;
  apiKey: string;
}) => Promise<{ status: number; body: SearchApiResponse | null }>;

export interface SearchOptions {
  fetchSearch?: FetchSearch;
  apiKey?: string;
}

/**
 * videoId는 11자 영숫자·언더스코어·하이픈. Data API가 정상적으로 돌려주지만
 * 형식 이상값을 렌더러까지 흘리지 않도록 여기서 한 번 더 검사한다.
 */
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

/**
 * Data API의 snippet.title은 &amp; &#39; &quot; 같은 HTML 엔티티가 섞여 온다.
 * 팔레트가 그대로 렌더링해도 안전한 평문으로 바꾼다.
 */
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
};

const decodeHtmlEntities = (input: string): string => {
  // 명명 엔티티 → 숫자 엔티티(&#123; · &#x7B;) 순서로 훑는다.
  let out = input;
  for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
    out = out.split(entity).join(replacement);
  }
  out = out.replace(/&#(\d+);/g, (_, code) =>
    String.fromCodePoint(parseInt(code, 10))
  );
  out = out.replace(/&#x([\da-fA-F]+);/g, (_, code) =>
    String.fromCodePoint(parseInt(code, 16))
  );
  return out;
};

const defaultFetchSearch: FetchSearch = async ({
  query,
  maxResults,
  apiKey,
}) => {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));
  // 임베드 가능한 영상만 — 사후 임베드 검사 대부분을 여기서 흡수한다.
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("regionCode", "KR");
  url.searchParams.set("relevanceLanguage", "ko");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), { method: "GET" });
  let body: SearchApiResponse | null = null;
  try {
    body = (await response.json()) as SearchApiResponse;
  } catch {
    body = null;
  }
  return { status: response.status, body };
};

/**
 * Data API가 준 error.errors[].reason으로 daily/minute를 판정.
 * quotaExceeded → daily로 매핑해서 오케스트레이터의 daily-lock 흐름을 그대로 쓴다.
 * rateLimitExceeded는 짧은 순간 스파이크라 minute로 취급한다.
 */
const mapQuotaReason = (
  body: SearchApiResponse | null
): { reason: QuotaExhaustionKind; message: string } | null => {
  const errors = body?.error?.errors;
  if (!Array.isArray(errors)) return null;
  for (const e of errors) {
    if (e.reason === "quotaExceeded" || e.reason === "dailyLimitExceeded") {
      return {
        reason: "daily",
        message: "오늘 유튜브 검색 몫을 다 썼어요. 자정에 다시 채워집니다.",
      };
    }
    if (
      e.reason === "userRateLimitExceeded" ||
      e.reason === "rateLimitExceeded"
    ) {
      return {
        reason: "minute",
        message: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요.",
      };
    }
  }
  return null;
};

const parseCandidates = (
  body: SearchApiResponse | null,
  wanted: number
): SearchCandidate[] => {
  const items = body?.items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: SearchCandidate[] = [];
  for (const item of items) {
    if (out.length >= wanted) break;
    const videoId = item.id?.videoId;
    if (!videoId || !VIDEO_ID_REGEX.test(videoId)) continue;
    if (seen.has(videoId)) continue;
    // 라이브 방송 조각은 재생 안정성이 낮으니 걸러낸다.
    // lo-fi 24시간 라이브도 걸러지지만 그건 나중에 별도 tuning으로 다룬다.
    if (item.snippet?.liveBroadcastContent === "live") continue;
    const rawTitle = item.snippet?.title ?? "";
    const title = decodeHtmlEntities(rawTitle).trim();
    if (!title) continue;
    const channel = decodeHtmlEntities(item.snippet?.channelTitle ?? "").trim();
    seen.add(videoId);
    out.push({ videoId, title, channel });
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

  const apiKey = options.apiKey ?? process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      error: "YouTube API 키가 설정되지 않았습니다.",
    };
  }

  const fetchSearch = options.fetchSearch ?? defaultFetchSearch;

  let response: { status: number; body: SearchApiResponse | null };
  try {
    response = await fetchSearch({
      query,
      maxResults: Math.min(50, count + REQUEST_BUFFER),
      apiKey,
    });
  } catch (error) {
    console.error("[youtube-search] 네트워크 오류", error);
    return { ok: false, status: 502, error: "유튜브 검색 응답을 받지 못했습니다." };
  }

  if (response.status === 403) {
    const quota = mapQuotaReason(response.body);
    if (quota) {
      return {
        ok: false,
        status: 429,
        error: quota.message,
        reason: quota.reason,
      };
    }
    // quotaExceeded가 아닌 403은 키·권한 문제.
    return { ok: false, status: 500, error: "유튜브 API 키가 유효하지 않습니다." };
  }
  if (response.status === 400) {
    return { ok: false, status: 400, error: "유튜브 검색 요청이 잘못됐습니다." };
  }
  if (response.status < 200 || response.status >= 300) {
    console.error(
      "[youtube-search] Data API 오류",
      response.status,
      response.body?.error?.message
    );
    return { ok: false, status: 502, error: "유튜브 검색 응답을 받지 못했습니다." };
  }

  const candidates = parseCandidates(response.body, count);
  return { ok: true, candidates };
};
