import { beforeEach, describe, expect, it, vi } from "vitest";
import type { YoutubeSearchCandidate } from "@/apis/services/ai-services/service";
import {
  clearYoutubeCache,
  getCachedCandidates,
  getStaleCandidates,
  normalizeQuery,
  putCandidates,
} from "./youtube-cache";

/** ai-quota.test.ts와 같은 방식으로 window.localStorage만 stub한다 — jsdom 없이 최소. */
const installLocalStorage = () => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    },
  });
};

const sample = (id: string, title: string): YoutubeSearchCandidate => ({
  videoId: id,
  title,
  channel: "테스트채널",
});

describe("normalizeQuery", () => {
  it("공백·대소문자 차이를 흡수한다", () => {
    expect(normalizeQuery("스터디 윗 미")).toBe(normalizeQuery("스터디윗미"));
    expect(normalizeQuery(" React 강의 ")).toBe(normalizeQuery("react강의"));
  });
});

describe("youtube-cache", () => {
  beforeEach(() => {
    installLocalStorage();
    clearYoutubeCache();
  });

  it("put한 결과를 같은 query로 다시 꺼낼 수 있다", () => {
    const candidates = [sample("aaaaaaaaaaa", "제목1")];
    putCandidates("스터디 윗 미", candidates);
    expect(getCachedCandidates("스터디윗미")).toEqual(candidates);
  });

  it("TTL이 지나면 getCachedCandidates는 null을 반환한다", () => {
    const now = 1_700_000_000_000;
    putCandidates("query", [sample("aaaaaaaaaaa", "t")], now);
    const eightDaysLater = now + 8 * 24 * 60 * 60 * 1000;
    expect(getCachedCandidates("query", eightDaysLater)).toBeNull();
  });

  it("TTL이 지나도 getStaleCandidates는 여전히 반환한다 (락 폴백)", () => {
    const now = 1_700_000_000_000;
    putCandidates("query", [sample("aaaaaaaaaaa", "t")], now);
    // getStaleCandidates는 now 인자 없이 저장된 값을 그대로 반환한다.
    // TTL을 무시하도록 설계된 폴백 경로.
    expect(getStaleCandidates("query")).not.toBeNull();
  });

  it("빈 배열은 저장하지 않는다", () => {
    putCandidates("빈결과", []);
    expect(getCachedCandidates("빈결과")).toBeNull();
  });

  it("MAX_ENTRIES 초과 시 오래된 항목부터 제거", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 35; i += 1) {
      putCandidates(`q${i}`, [sample("aaaaaaaaaaa", `t${i}`)], now + i * 1000);
    }
    // 가장 오래된 q0은 제거됐어야 한다.
    expect(getStaleCandidates("q0")).toBeNull();
    // 최근 것들은 남아있다.
    expect(getStaleCandidates("q34")).not.toBeNull();
  });
});
