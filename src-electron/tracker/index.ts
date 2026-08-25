import { randomUUID } from "crypto";
import { ipcMain } from "electron";
import { APP_PRESETS } from "../../data/app-presets";
import type { AppLabel, SessionSummary } from "../../types/tracking";
import { buildLabelIndex, resolveLabel } from "./label-resolver";
import { createPoller } from "./poller";
import { attachPowerMonitor } from "./power-guard";
import {
  appendSegment,
  endSession,
  freezeSession,
  getActiveSession,
  getOverrides,
  isSessionActive,
  recordSample,
  removeOverride,
  setOverride,
  startSession,
} from "./session-store";
import {
  DEFAULT_THRESHOLDS,
  initialState,
  reduce,
  toDistractionSegment,
  type MachineState,
} from "./state-machine";

/**
 * Tracker의 진입점.
 *
 * - 렌더러 → 메인 IPC 채널 등록 (tracker:start, tracker:stop, tracker:get-labels, tracker:set-label)
 * - 폴러·상태 머신·session-store·powerMonitor를 하나의 실행 흐름으로 묶는다.
 * - 세그먼트 확정 시 실시간 알림은 보내지 않는다 — 세션 요약은 pull 방식(stopSession 반환값).
 *
 * ## 왜 여기 하나에 모아뒀는가
 * 폴러·상태머신·저장은 각각 독립적으로 테스트되지만, 그것들을 연결하는 로직은
 * 필연적으로 통합 지점이 필요하다. 그 통합을 이 파일 하나로 좁혀둬 IPC 채널의
 * 정합성과 이벤트 순서를 한눈에 볼 수 있게 한다.
 */

const POLL_INTERVAL_MS = 5_000;

let machineState: MachineState = initialState;
const labelIndex = buildLabelIndex(APP_PRESETS);

let poller: ReturnType<typeof createPoller> | null = null;
let detachPower: (() => void) | null = null;
let overridesCache: Record<string, AppLabel> = {};

const flushEmit = (
  emit: {
    appName: string;
    label: AppLabel;
    durationSec: number;
    confirmed: true;
    startedAtMs: number;
    endedAtMs: number;
  } | undefined,
  sessionId: string
): void => {
  if (!emit) return;
  const segment = toDistractionSegment(emit, {
    id: randomUUID(),
    sessionId,
  });
  appendSegment(segment);
};

const onSample = async (
  appName: string | null,
  nowMs: number
): Promise<void> => {
  const session = getActiveSession();
  if (!session) return; // 세션이 없으면 폴링 결과 무시.

  const deltaMs = recordSample(nowMs);
  const label: AppLabel = appName
    ? resolveLabel(appName, process.platform, labelIndex, overridesCache)
    : "neutral";

  const { next, emit } = reduce(
    machineState,
    { type: "sample", appName, label, nowMs, deltaMs },
    DEFAULT_THRESHOLDS
  );

  machineState = next;
  flushEmit(emit, session.id);
};

const beginTracking = (): void => {
  if (poller?.isRunning()) return;

  machineState = initialState;

  poller = createPoller({
    intervalMs: POLL_INTERVAL_MS,
    onSample: (appName, nowMs) => {
      // Promise를 await하지 않는 이유: setInterval 콜백은 재진입 방지가 poller 안에 있고
      // 여기서 error를 실질적으로 다룰 방법이 없다. 로깅은 아래 onError가 담당.
      void onSample(appName, nowMs);
    },
    onError: (error) => {
      // 첫 폴 실패는 흔하다(정보성). 반복 실패도 여기 로그로 잡히도록 남긴다.
      console.warn("[tracker] activeWindow 실패:", error);
    },
  });

  detachPower = attachPowerMonitor({
    onSuspend: (nowMs) => {
      freezeSession(nowMs);
      const session = getActiveSession();
      const { next, emit } = reduce(machineState, { type: "suspend", nowMs });
      machineState = next;
      if (session) flushEmit(emit, session.id);
    },
    onResume: (nowMs) => {
      const session = getActiveSession();
      const { next, emit } = reduce(machineState, { type: "resume", nowMs });
      machineState = next;
      if (session) flushEmit(emit, session.id);
    },
    onLock: (nowMs) => {
      freezeSession(nowMs);
      const session = getActiveSession();
      const { next, emit } = reduce(machineState, { type: "lock", nowMs });
      machineState = next;
      if (session) flushEmit(emit, session.id);
    },
    onUnlock: (nowMs) => {
      const session = getActiveSession();
      const { next, emit } = reduce(machineState, { type: "unlock", nowMs });
      machineState = next;
      if (session) flushEmit(emit, session.id);
    },
  });

  poller.start();
};

const stopTracking = (): void => {
  poller?.stop();
  poller = null;
  detachPower?.();
  detachPower = null;
};

const handleStart = async (): Promise<void> => {
  if (isSessionActive()) return; // 중복 start는 무시. 이미 활성인 세션을 덮어쓰지 않는다.
  overridesCache = await getOverrides();
  startSession(randomUUID());
  beginTracking();
};

const handleStop = async (): Promise<SessionSummary | null> => {
  if (!isSessionActive()) return null;
  const session = getActiveSession()!;

  // 진행 중이던 confirmed/recovering 세그먼트를 강제 emit.
  const { next, emit } = reduce(machineState, { type: "stop", nowMs: Date.now() });
  machineState = next;
  flushEmit(emit, session.id);

  stopTracking();
  return await endSession();
};

/**
 * IPC 채널 등록. main.ts의 app.whenReady 안에서 한 번만 부른다.
 * 렌더러가 여러 번 마운트돼도 재등록되지 않도록 방어한다.
 */
let ipcRegistered = false;

export const registerTrackerIpc = (): void => {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.on("tracker:start", () => {
    void handleStart().catch((error) => {
      console.error("[tracker] start 실패:", error);
    });
  });

  ipcMain.handle("tracker:stop", async () => {
    try {
      return await handleStop();
    } catch (error) {
      console.error("[tracker] stop 실패:", error);
      return null;
    }
  });

  ipcMain.handle("tracker:get-labels", async () => {
    const overrides = await getOverrides();
    return { presets: APP_PRESETS, overrides };
  });

  ipcMain.handle(
    "tracker:set-label",
    async (_event, appName: string, label: AppLabel) => {
      if (label === "study" || label === "distract" || label === "neutral") {
        await setOverride(appName, label);
        // 폴링 중이면 실시간 반영을 위해 캐시 갱신
        overridesCache = await getOverrides();
      }
    }
  );

  ipcMain.handle("tracker:remove-label", async (_event, appName: string) => {
    await removeOverride(appName);
    overridesCache = await getOverrides();
  });
};
