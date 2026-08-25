import AiService, {
  type YoutubeSearchCandidate,
} from "@/apis/services/ai-services/service";

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
 * 검색 → 임베드 검사 → 통과분만 반환.
 * search 결과가 비어 있거나 모두 걸러지면 빈 배열이 나온다. 사용자에게는 별도 안내로 전환한다.
 */
export const searchAndFilter = async (
  query: string,
  count: number
): Promise<FilteredCandidate[]> => {
  const { candidates } = await AiService.youtubeSearch({ query, count });
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
