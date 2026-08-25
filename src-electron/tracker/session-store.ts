import type {
  AppLabel,
  DistractionSegment,
  SessionSummary,
} from "../../types/tracking";

/**
 * 세션 진행 상태와 오버라이드·최근 세션 저장.
 *
 * electron-store를 쓰는 이유:
 * - atomic write가 이미 구현돼 있다. 우리가 파일 잠금·부분 쓰기 방어 코드를 만들 필요가 없다.
 * - main 프로세스에서 sync/async 둘 다 지원한다.
 * - 스키마 마이그레이션은 없지만, `version` 필드로 우리가 방어한다.
 *
 * ESM 전용 패키지라 dynamic import로 로드한다(get-windows와 같은 이유).
 *
 * 이 파일은 IPC를 모른다 — index.ts가 얹는다.
 */

interface StoreShape {
  version: number;
  overrides: Record<string, AppLabel>;
  /** 최근 30일 세션. 그보다 오래된 것은 저장 시 잘라낸다. */
  sessions: SessionSummary[];
}

const STORE_VERSION = 1;
const MAX_SESSIONS_DAYS = 30;

const DEFAULTS: StoreShape = {
  version: STORE_VERSION,
  overrides: {},
  sessions: [],
};

interface ElectronStore<T> {
  get<K extends keyof T>(key: K): T[K];
  set<K extends keyof T>(key: K, value: T[K]): void;
  store: T;
}

let cachedStore: ElectronStore<StoreShape> | null = null;

const loadStore = async (): Promise<ElectronStore<StoreShape>> => {
  if (cachedStore) return cachedStore;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import("electron-store")) as any;
  const Store = (mod.default ?? mod) as new (opts: {
    name: string;
    defaults: StoreShape;
  }) => ElectronStore<StoreShape>;

  const store = new Store({ name: "tracker", defaults: DEFAULTS });

  // version이 미래이거나 알 수 없는 값이면 defaults로 되돌린다.
  // 마이그레이션 규칙은 필요해질 때 여기에 추가한다.
  const currentVersion = store.get("version");
  if (typeof currentVersion !== "number" || currentVersion > STORE_VERSION) {
    store.set("version", STORE_VERSION);
    store.set("overrides", {});
    store.set("sessions", []);
  }

  cachedStore = store;
  return store;
};

// ── 진행 중 세션 상태 (인메모리) ─────────────────────────────────────────

/**
 * 세션은 한 번에 하나만 활성이다. 스톱워치·뽀모도로 work 사이클 각각이 세션 하나.
 * 이 값은 대기 중 세션이 없을 때 null이다.
 */
interface ActiveSession {
  id: string;
  startedAtMs: number;
  segments: DistractionSegment[];
  /** 이전 샘플의 시각 — deltaMs 계산용. */
  lastSampleAtMs: number | null;
  /** suspend/lock 구간의 시작. resume/unlock에서 지운다. */
  frozenSinceMs: number | null;
}

let activeSession: ActiveSession | null = null;

export const startSession = (id: string, nowMs: number = Date.now()): void => {
  activeSession = {
    id,
    startedAtMs: nowMs,
    segments: [],
    lastSampleAtMs: null,
    frozenSinceMs: null,
  };
};

export const getActiveSession = (): Readonly<ActiveSession> | null => activeSession;

export const isSessionActive = (): boolean => activeSession !== null;

export const recordSample = (nowMs: number): number => {
  if (!activeSession) return 0;
  if (activeSession.frozenSinceMs !== null) {
    // 얼려져 있으면 delta는 0으로 취급하고 상태만 갱신. resume 뒤 첫 샘플이 이 경로로 들어온다.
    activeSession.lastSampleAtMs = nowMs;
    activeSession.frozenSinceMs = null;
    return 0;
  }
  const last = activeSession.lastSampleAtMs ?? nowMs;
  const delta = Math.max(0, nowMs - last);
  activeSession.lastSampleAtMs = nowMs;
  return delta;
};

export const freezeSession = (nowMs: number): void => {
  if (!activeSession) return;
  if (activeSession.frozenSinceMs === null) {
    activeSession.frozenSinceMs = nowMs;
  }
};

export const appendSegment = (segment: DistractionSegment): void => {
  if (!activeSession) return;
  activeSession.segments.push(segment);
};

/**
 * 세션 종료. 요약을 만들고 최근 30일 목록에 저장한다.
 * 상태 머신의 남은 confirmed/recovering은 caller가 stop 이벤트로 먼저 flush한 뒤 부른다.
 */
export const endSession = async (
  nowMs: number = Date.now()
): Promise<SessionSummary | null> => {
  if (!activeSession) return null;
  const session = activeSession;
  activeSession = null;

  const rawDurationSec = Math.max(0, Math.round((nowMs - session.startedAtMs) / 1000));
  const distractionSec = session.segments
    .filter((s) => s.confirmed)
    .reduce((sum, s) => sum + s.durationSec, 0);

  const summary: SessionSummary = {
    sessionId: session.id,
    startedAt: new Date(session.startedAtMs).toISOString(),
    endedAt: new Date(nowMs).toISOString(),
    rawDurationSec,
    distractionSec,
    correctedDurationSec: Math.max(0, rawDurationSec - distractionSec),
    segments: session.segments,
  };

  try {
    const store = await loadStore();
    const kept = pruneOldSessions(store.get("sessions"), nowMs);
    store.set("sessions", [...kept, summary]);
  } catch (error) {
    // 저장 실패해도 요약은 반환한다. 사용자에게 세션 결과를 보여주는 것이 우선이다.
    console.error("[tracker] 세션 저장 실패:", error);
  }

  return summary;
};

const pruneOldSessions = (
  sessions: SessionSummary[],
  nowMs: number
): SessionSummary[] => {
  const cutoff = nowMs - MAX_SESSIONS_DAYS * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => new Date(s.startedAt).getTime() >= cutoff);
};

// ── 오버라이드 API ────────────────────────────────────────────────────────

export const getOverrides = async (): Promise<Record<string, AppLabel>> => {
  const store = await loadStore();
  return store.get("overrides");
};

export const setOverride = async (
  appName: string,
  label: AppLabel
): Promise<void> => {
  const store = await loadStore();
  const current = store.get("overrides");
  store.set("overrides", { ...current, [appName]: label });
};

export const removeOverride = async (appName: string): Promise<void> => {
  const store = await loadStore();
  const current = { ...store.get("overrides") };
  delete current[appName];
  store.set("overrides", current);
};

/** 테스트에서 캐시된 인스턴스를 초기화하기 위한 헬퍼. */
export const __resetForTests = (): void => {
  cachedStore = null;
  activeSession = null;
};
