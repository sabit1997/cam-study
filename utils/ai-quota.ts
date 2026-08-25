import type { AiPurpose } from "@/apis/services/ai-services/service";

/**
 * 세션당 AI 호출을 클라이언트에서 선제로 막는다.
 *
 * 왜 서버가 아니라 클라이언트에서 세는가:
 * - 서버는 이미 IP 레이트리밋(api/ai-interpret.ts)을 갖고 있다. 그건 악성 스크립트를 막는 층이지
 *   정상 사용자에게 "오늘 몫이 얼마 남았다"고 알려주는 층이 아니다.
 * - 서버 429가 나오는 순간, 사용자에게는 이미 실패로 보인다. 그 실패를 사전에 UI로 가리려면
 *   요청을 보내기 전에 한 번 세는 층이 필요하다.
 * - 우회할 수 있다(localStorage 삭제). 발표 데모에서는 그걸로 충분하고, 실제 악용은
 *   서버 층이 붙잡는다.
 *
 * purpose별 가중치가 다른 이유: 무거운 호출이 무료 티어 할당량을 더 크게 태우므로,
 * 사용자에게도 그만큼 비싸게 셈해야 남은 몫이 실제 남은 몫과 어긋나지 않는다.
 */

const STORAGE_KEY = "aiQuota";

export const SESSION_BUDGET = 20;

export const WEIGHTS: Record<AiPurpose, number> = {
  command: 1,
  "record-query": 1,
  "label-suggest": 1,
  "youtube-search": 2,
  "video-analyze": 3,
};

interface QuotaState {
  /** 예산이 리셋된 자정 시각(로컬 YYYY-MM-DD) */
  date: string;
  /** 지금까지 소비한 가중치 합계 */
  used: number;
}

const localDateKey = (now: Date): string => {
  // toLocaleDateString("en-CA")는 YYYY-MM-DD로 안정적으로 나온다.
  // toISOString은 UTC 기준이라 자정 근처 사용자 로컬과 어긋난다.
  return now.toLocaleDateString("en-CA");
};

const isBrowser = (): boolean =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readState = (now: Date): QuotaState => {
  const today = localDateKey(now);
  if (!isBrowser()) return { date: today, used: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: today, used: 0 };
    const parsed = JSON.parse(raw) as Partial<QuotaState>;
    if (parsed.date !== today || typeof parsed.used !== "number") {
      return { date: today, used: 0 };
    }
    // 음수/NaN 등 이상값은 리셋하는 게 안전하다. 사용자에게 마이너스 남은 몫을 보여줄 이유가 없다.
    if (!Number.isFinite(parsed.used) || parsed.used < 0) {
      return { date: today, used: 0 };
    }
    return { date: today, used: parsed.used };
  } catch {
    // JSON 깨졌으면 리셋. localStorage 데이터를 신뢰하지 못하는 상황을 앱이 크래시로 확대하지 않는다.
    return { date: today, used: 0 };
  }
};

const writeState = (state: QuotaState): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 쓰기 실패(용량 초과, 프라이빗 모드 등)는 무시. quota가 정확하지 않을 뿐 앱 동작은 유지된다.
  }
};

export const getRemaining = (now: Date = new Date()): number => {
  const state = readState(now);
  return Math.max(0, SESSION_BUDGET - state.used);
};

export interface ConsumeResult {
  ok: boolean;
  remaining: number;
}

/**
 * purpose 하나의 호출을 예약한다. 예산이 부족하면 { ok: false }를 돌려주고 아무것도 소비하지 않는다.
 *
 * 호출 성공 여부와 무관하게 소비되는 것에 주의. "요청을 보낼 결심"을 세는 층이므로,
 * 요청이 서버에서 실패해도 되돌리지 않는다(재시도 무한 루프 방지).
 */
export const consume = (
  purpose: AiPurpose,
  now: Date = new Date()
): ConsumeResult => {
  const state = readState(now);
  const cost = WEIGHTS[purpose];
  const nextUsed = state.used + cost;
  if (nextUsed > SESSION_BUDGET) {
    return { ok: false, remaining: Math.max(0, SESSION_BUDGET - state.used) };
  }
  writeState({ date: state.date, used: nextUsed });
  return { ok: true, remaining: Math.max(0, SESSION_BUDGET - nextUsed) };
};

/** 테스트와 개발자 도구에서 쓴다. 사용자 UI에서는 노출하지 않는다. */
export const reset = (): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
};
