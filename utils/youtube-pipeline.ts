import AiService, {
  type YoutubeSearchCandidate,
} from "@/apis/services/ai-services/service";
import {
  getCachedCandidates,
  getStaleCandidates,
  putCandidates,
} from "@/utils/youtube-cache";
import {
  isDailyLocked,
  setDailyLock,
} from "@/utils/ai-daily-lock";
import { parseQuotaReason } from "@/utils/api-error";

/**
 * 유튜브 검색 → 임베드 검사 → 후보 정리 오케스트레이터.
 *
 * ## 왜 임베드 검사가 승인 전인가 (설계 문서 §2.6)
 * 후보를 승인 UI에 먼저 보여주고 나중에 임베드 검사를 하면, 사용자가 고른 영상이
 * 나중에 "재생할 수 없음"으로 사라지는 최악의 흐름이 된다. 승인 패널에는 통과분만 뜨게 한다.
 *
 * ## LLM은 URL을 생성하지 않는다
 * server/youtube-search.ts가 그라운딩 검색으로 얻은 videoId만 반환하고,
 * 이 파일은 그 id로 임베드 검사와 화면 조립을 한다. LLM이 "youtu.be/..." 문자열을
 * 지어서 넘겨도 여기까지 오지 못한다(스키마 · 정규식 · 임베드 검사 세 층에서 걸린다).
 */

export interface EmbedResult {
  videoId: string;
  isEmbeddable: boolean;
  /** YouTube Data API가 준 공식 제목. LLM이 준 title보다 이걸 우선한다. */
  title: string | null;
}

/** 후보 하나에 대한 임베드 검사. check-youtube 엔드포인트를 호출한다. */
export const checkEmbeddable = async (videoId: string): Promise<EmbedResult> => {
  try {
    const response = await fetch("/api/check-youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
      credentials: "include",
    });
    if (!response.ok) return { videoId, isEmbeddable: false, title: null };
    const data = (await response.json()) as {
      isEmbeddable?: boolean;
      title?: string | null;
    };
    return {
      videoId,
      isEmbeddable: Boolean(data.isEmbeddable),
      title: data.title ?? null,
    };
  } catch {
    // 네트워크 실패는 조용히 임베드 불가로 취급. 승인 패널에서 자연스럽게 제외된다.
    return { videoId, isEmbeddable: false, title: null };
  }
};

export interface FilteredCandidate {
  videoId: string;
  /** 임베드 검사가 준 제목이 있으면 그것을, 없으면 LLM 제목을 쓴다. */
  title: string;
  channel: string;
}

/**
 * 검색 결과의 출처. 팔레트가 사용자에게 "지난번 결과예요" 안내를 보여줄지 결정한다.
 * - fresh: 방금 API에서 받아온 결과
 * - cache: 신선한 캐시(TTL 이내)
 * - stale: TTL은 지났지만 daily-lock으로 API를 못 태워 재사용한 결과
 */
export type SearchSource = "fresh" | "cache" | "stale";

export type SearchOutcome =
  | { ok: true; candidates: FilteredCandidate[]; source: SearchSource }
  | { ok: false; kind: "locked-empty"; message: string }
  | { ok: false; kind: "error"; message: string };

const LOCKED_EMPTY_MESSAGE =
  "AI 무료 사용량을 오늘 다 썼어요. 내일 다시 시도하거나, 이전에 검색한 적 있는 키워드를 다시 써 주세요.";

const runEmbedFilter = async (
  candidates: YoutubeSearchCandidate[]
): Promise<FilteredCandidate[]> => {
  if (candidates.length === 0) return [];
  const checks = await Promise.all(
    candidates.map((c: YoutubeSearchCandidate) => checkEmbeddable(c.videoId))
  );
  const out: FilteredCandidate[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const check = checks[i];
    if (!check.isEmbeddable) continue;
    const src = candidates[i];
    out.push({
      videoId: src.videoId,
      title: check.title ?? src.title,
      channel: src.channel,
    });
  }
  return out;
};

/**
 * 검색 → 임베드 검사 → 통과분만 반환. 캐시·daily-lock과 통합돼 있어
 * 같은 검색어를 되풀이하거나 quota 소진 상태에서도 사용자에게 결과를 보여주려 시도한다.
 *
 * 흐름:
 * 1. daily-lock이 걸려 있으면 API를 태우지 않고 stale 캐시를 시도한다.
 * 2. 락이 없으면 신선한 캐시부터 확인.
 * 3. 신선한 캐시가 없으면 API 호출. 성공 시 결과를 캐시에 저장.
 * 4. 429 daily 응답이 오면 락을 저장하고 stale 캐시를 마지막으로 시도.
 *
 * 임베드 검사는 어떤 소스에서 왔든 다시 태워, 삭제된 videoId는 자동으로 걸러진다.
 */
export const searchAndFilter = async (
  query: string,
  count: number
): Promise<SearchOutcome> => {
  // 1. 락 확인 — API 콜을 아예 안 태우고 stale로 우회
  if (isDailyLocked("youtube-search")) {
    const stale = getStaleCandidates(query);
    if (stale && stale.length > 0) {
      const filtered = await runEmbedFilter(stale.slice(0, count));
      if (filtered.length > 0) {
        return { ok: true, candidates: filtered, source: "stale" };
      }
    }
    return { ok: false, kind: "locked-empty", message: LOCKED_EMPTY_MESSAGE };
  }

  // 2. 신선한 캐시
  const fresh = getCachedCandidates(query);
  if (fresh && fresh.length > 0) {
    const filtered = await runEmbedFilter(fresh.slice(0, count));
    if (filtered.length > 0) {
      return { ok: true, candidates: filtered, source: "cache" };
    }
    // 캐시된 후보가 전부 임베드 불가로 걸러졌으면 신선 검색으로 진행.
  }

  // 3. 실제 API 호출
  try {
    const { candidates } = await AiService.youtubeSearch({ query, count });
    if (candidates.length > 0) {
      putCandidates(query, candidates);
    }
    const filtered = await runEmbedFilter(candidates);
    return { ok: true, candidates: filtered, source: "fresh" };
  } catch (error) {
    const info = parseQuotaReason(error);
    // 4. daily 소진이면 락 저장 후 stale 시도
    if (info.status === 429 && info.reason === "daily") {
      setDailyLock("youtube-search", info.retryAfterSec);
      const stale = getStaleCandidates(query);
      if (stale && stale.length > 0) {
        const filtered = await runEmbedFilter(stale.slice(0, count));
        if (filtered.length > 0) {
          return { ok: true, candidates: filtered, source: "stale" };
        }
      }
      return { ok: false, kind: "locked-empty", message: LOCKED_EMPTY_MESSAGE };
    }
    // 다른 오류는 서버 문구를 그대로 사용자에게 전달
    return {
      ok: false,
      kind: "error",
      message:
        (error && typeof error === "object" && "response" in error
          ? (
              (error as { response?: { data?: { error?: unknown } } }).response
                ?.data?.error as string | undefined
            )
          : undefined) ?? "유튜브 검색에 실패했어요.",
    };
  }
};

/**
 * 사용자가 승인한 후보들을 CamStudy 재생 가능한 PLAY_YOUTUBE 액션 배열로 조립.
 * 같은 ref로 묶어 한 유튜브 창의 재생목록으로 들어간다(utils/ai-action-plan.ts 참고).
 */
export const toPlayActions = (
  selected: FilteredCandidate[]
): Array<{ type: "CREATE_WINDOW" | "PLAY_YOUTUBE"; [k: string]: unknown }> => {
  if (selected.length === 0) return [];
  const ref = `yt${Date.now().toString(36).slice(-6)}`;
  const actions: Array<{ type: string; [k: string]: unknown }> = [
    { type: "CREATE_WINDOW", widget: "youtube", ref },
  ];
  for (const c of selected) {
    actions.push({
      type: "PLAY_YOUTUBE",
      ref,
      url: `https://www.youtube.com/watch?v=${c.videoId}`,
    });
  }
  return actions as Array<{
    type: "CREATE_WINDOW" | "PLAY_YOUTUBE";
    [k: string]: unknown;
  }>;
};
