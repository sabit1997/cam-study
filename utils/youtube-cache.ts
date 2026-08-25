import type { YoutubeSearchCandidate } from "@/apis/services/ai-services/service";

/**
 * 유튜브 검색 결과의 클라이언트 캐시.
 *
 * ## 왜 클라이언트에 두나
 * Gemini API 요청은 Vercel Function에서만 나가지만, 캐시를 서버에 두려면 Vercel KV 같은
 * 별도 인프라가 필요하다. 각자의 브라우저가 최근 검색을 재사용하는 것만으로도
 * 같은 사용자의 반복 검색은 quota를 소비하지 않게 되고, dev·web·electron이 동일하게 동작한다.
 *
 * ## 왜 TTL이 길어야 하나 (7일)
 * 이 캐시는 두 상황을 함께 해결한다:
 * - "방금 봤던 검색 결과를 다시 검색했다" — 짧은 재사용
 * - "AI가 오늘 쉬는 중 (daily 소진)" — 락 걸린 상태에서 최근 결과 재사용
 * daily-lock과 짝을 이루므로, 하루보다 넉넉히 잡아 fallback 소스가 되도록 한다.
 *
 * ## 정규화
 * "스터디 윗 미", "스터디윗미", "  스터디 윗 미 " 를 같은 key로 취급한다.
 * NFC 정규화 + 공백 제거 + 소문자화. 사용자가 쓰는 표기 차이로 캐시 miss가 잦아지는 것을 막는다.
 */

const STORAGE_KEY = "yt-search-cache:v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 30;

export interface CacheEntry {
  candidates: YoutubeSearchCandidate[];
  savedAt: number;
}

interface CacheShape {
  [normalizedQuery: string]: CacheEntry;
}

export const normalizeQuery = (raw: string): string =>
  raw.normalize("NFC").replace(/\s+/g, "").toLowerCase();

const hasStorage = (): boolean =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readAll = (): CacheShape => {
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as CacheShape) : {};
  } catch {
    return {};
  }
};

const writeAll = (shape: CacheShape): void => {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch {
    // 저장 공간 부족 등은 조용히 무시한다. 캐시는 성능 최적화지 필수 저장소가 아니다.
  }
};

/** 지금 유효한 캐시 항목이면 반환. 만료됐으면 null. */
export const getCachedCandidates = (
  query: string,
  now: number = Date.now()
): YoutubeSearchCandidate[] | null => {
  const shape = readAll();
  const entry = shape[normalizeQuery(query)];
  if (!entry) return null;
  if (now - entry.savedAt > TTL_MS) return null;
  return entry.candidates;
};

/**
 * 만료 여부 무시하고 캐시된 항목을 그대로 반환. daily-lock으로 API를 못 태우는 상황에
 * "아무 응답이라도" 보여주기 위한 폴백 경로다. 없으면 null.
 */
export const getStaleCandidates = (
  query: string
): YoutubeSearchCandidate[] | null => {
  const entry = readAll()[normalizeQuery(query)];
  return entry?.candidates ?? null;
};

export const putCandidates = (
  query: string,
  candidates: YoutubeSearchCandidate[],
  now: number = Date.now()
): void => {
  if (candidates.length === 0) return;
  const shape = readAll();
  shape[normalizeQuery(query)] = { candidates, savedAt: now };
  writeAll(pruneOldest(shape, now));
};

/** 최대 크기 초과 시 가장 오래된 것부터 제거. */
const pruneOldest = (shape: CacheShape, now: number): CacheShape => {
  const entries = Object.entries(shape).filter(
    ([, e]) => now - e.savedAt <= TTL_MS
  );
  if (entries.length <= MAX_ENTRIES) {
    return Object.fromEntries(entries);
  }
  entries.sort(([, a], [, b]) => b.savedAt - a.savedAt);
  return Object.fromEntries(entries.slice(0, MAX_ENTRIES));
};

/** 테스트·설정 초기화용. */
export const clearYoutubeCache = (): void => {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
