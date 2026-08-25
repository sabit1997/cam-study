import type { AppLabel, DistractionSegment } from "../../types/tracking";

/**
 * 딴짓 감지 상태 머신.
 *
 * 이 파일은 순수함수만 담는다. get-windows, electron-store, powerMonitor 어느 것에도 의존하지 않는다.
 * 그 덕에 시간을 마음대로 조작하면서 5분 임계·60초 복귀·suspend 얼림을 테스트할 수 있다.
 *
 * 왜 별도 파일인가:
 * - 폴링/저장/IPC와 뒤섞이면 시나리오 하나 검증하는 데 Electron을 띄워야 한다.
 * - 상태 전이 규칙은 데모 스토리("5분 넘게 카톡")의 논리 그 자체다. 여기가 틀리면 전체가 틀린다.
 *
 * ## 결정된 파라미터 (설계 문서 §2.2)
 * - distractThresholdMs: 5분 (300_000). 딴짓 앱에 이만큼 붙어 있으면 확정.
 * - recoveryHoldMs: 60초 (60_000). study 앱에 이만큼 붙어 있으면 세그먼트 종료.
 * - suspend/lock 구간은 시계에서 뺀다. wall-clock 아니라 폴링이 살아있는 시간만 센다.
 */

export interface Thresholds {
  distractThresholdMs: number;
  recoveryHoldMs: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  distractThresholdMs: 300_000,
  recoveryHoldMs: 60_000,
};

/**
 * 머신은 네 상태를 오간다.
 * - study: 학습 모드. distract 샘플이 오면 candidate로 전이.
 * - candidate: 딴짓 후보. 임계 도달 전.
 * - confirmed: 확정된 딴짓 (진행 중).
 * - recovering: 확정 세그먼트가 아직 열려 있는데 사용자는 study로 잠깐 돌아왔다.
 *   60초 이상 study가 이어지면 emit하고 닫힘. 60초 안에 같은 딴짓 앱으로 돌아오면 재개(카톡 잠깐 대답하고 돌아옴).
 *   다른 딴짓 앱으로 가면 이전 세그먼트를 닫고 새 후보로 시작.
 *
 * neutral 앱(브라우저 · 파인더 · CamStudy 자신)은 어느 상태에서도 "관망"한다:
 * 카운터를 진행시키지도 리셋하지도 않는다. 딴짓과 학습 사이의 완충층이다.
 */
export type MachineState =
  | { kind: "study" }
  | { kind: "candidate"; appName: string; sinceMs: number }
  | { kind: "confirmed"; appName: string; sinceMs: number }
  | {
      kind: "recovering";
      pendingApp: string;
      pendingDurationMs: number;
      pendingStartedAtMs: number;
      recoveryMs: number;
    };

export const initialState: MachineState = { kind: "study" };

export type Event =
  | {
      type: "sample";
      appName: string | null;
      label: AppLabel;
      nowMs: number;
      /** 이 샘플과 직전 샘플 사이의 활성 경과 시간(ms). suspend는 여기서 이미 뺀 값이 온다. */
      deltaMs: number;
    }
  | { type: "suspend" | "lock" | "resume" | "unlock"; nowMs: number }
  | { type: "stop"; nowMs: number };

export interface Reduction {
  next: MachineState;
  /**
   * 확정 세그먼트가 종료됐을 때 방출.
   * sessionId·id는 caller가 채운다 — 머신은 identity를 몰라도 되게 최소 정보만 준다.
   */
  emit?: EmittedSegment;
}

export interface EmittedSegment {
  appName: string;
  label: AppLabel;
  durationSec: number;
  /** confirmed=true만 emit한다. candidate 자연 소멸은 emit하지 않는다. */
  confirmed: true;
  startedAtMs: number;
  endedAtMs: number;
}

const isDistractive = (label: AppLabel): boolean => label === "distract";

const emitFromConfirmed = (
  appName: string,
  durationMs: number,
  endedAtMs: number
): EmittedSegment => ({
  appName,
  label: "distract",
  durationSec: Math.max(0, Math.round(durationMs / 1000)),
  confirmed: true,
  startedAtMs: endedAtMs - durationMs,
  endedAtMs,
});

const emitFromRecovering = (
  state: Extract<MachineState, { kind: "recovering" }>,
  endedAtMs: number
): EmittedSegment => ({
  appName: state.pendingApp,
  label: "distract",
  durationSec: Math.max(0, Math.round(state.pendingDurationMs / 1000)),
  confirmed: true,
  startedAtMs: state.pendingStartedAtMs,
  endedAtMs,
});

/**
 * 상태 전이의 유일한 진입점.
 *
 * 반환값의 next는 항상 새 객체다(구조적 공유 없음). 렌더러에 넘길 일이 있어도 참조 비교로
 * 변경을 감지할 수 있게 하려는 설계 선택이다.
 */
export const reduce = (
  prev: MachineState,
  event: Event,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): Reduction => {
  switch (event.type) {
    case "sample":
      return onSample(prev, event, thresholds);

    case "suspend":
    case "lock":
      // 카운터를 얼려두기만 한다 — 샘플 이벤트가 오지 않는 한 시간은 흐르지 않는다.
      // 락 상태에서도 confirmed 세그먼트를 즉시 닫지는 않는다. 대개는 잠깐 자리비움이고,
      // 그동안의 시간은 "딴짓"이라고 부르기 어렵다. 최종 확정은 stop 시점에.
      return { next: prev };

    case "resume":
    case "unlock":
      return { next: prev };

    case "stop":
      return onStop(prev, event.nowMs);
  }
};

const onStop = (prev: MachineState, nowMs: number): Reduction => {
  // confirmed면 지금까지의 지속시간으로 강제 emit.
  if (prev.kind === "confirmed") {
    return {
      next: initialState,
      emit: emitFromConfirmed(prev.appName, prev.sinceMs, nowMs),
    };
  }
  // recovering이면 pending 세그먼트를 그대로 emit — 세션이 끝났고 recovery 조건은 불확실하지만,
  // "5분 이상 딴짓했다"는 사실 자체는 이미 확정된 상태다.
  if (prev.kind === "recovering") {
    return {
      next: initialState,
      emit: emitFromRecovering(prev, nowMs),
    };
  }
  // candidate는 임계 미달이라 정의상 딴짓이 아니다. emit 없이 폐기.
  return { next: initialState };
};

const onSample = (
  prev: MachineState,
  event: Extract<Event, { type: "sample" }>,
  thresholds: Thresholds
): Reduction => {
  const { appName, label, deltaMs, nowMs } = event;
  const distractive = isDistractive(label);

  switch (prev.kind) {
    case "study": {
      if (distractive && appName) {
        return { next: { kind: "candidate", appName, sinceMs: deltaMs } };
      }
      return { next: prev };
    }

    case "candidate": {
      if (distractive && appName === prev.appName) {
        const totalMs = prev.sinceMs + deltaMs;
        if (totalMs >= thresholds.distractThresholdMs) {
          return { next: { kind: "confirmed", appName: prev.appName, sinceMs: totalMs } };
        }
        return { next: { kind: "candidate", appName: prev.appName, sinceMs: totalMs } };
      }
      if (distractive && appName && appName !== prev.appName) {
        // 딴짓 앱이 바뀌었다 (카톡→디스코드). 이전 후보는 임계 미달이므로 자연 소멸.
        return { next: { kind: "candidate", appName, sinceMs: deltaMs } };
      }
      if (label === "neutral") {
        // 브라우저 잠깐 훑기 — 후보 카운터를 리셋하지도 진행시키지도 않는다.
        return { next: prev };
      }
      // study 앱으로 복귀. 5분 미달은 딴짓이 아니다.
      return { next: initialState };
    }

    case "confirmed": {
      if (distractive && appName === prev.appName) {
        return {
          next: { kind: "confirmed", appName: prev.appName, sinceMs: prev.sinceMs + deltaMs },
        };
      }
      if (distractive && appName && appName !== prev.appName) {
        // 딴짓 A → 딴짓 B: A를 emit하고 B는 새 후보로 시작. 각 구간이 개별 세그먼트로 남는다.
        return {
          next: { kind: "candidate", appName, sinceMs: deltaMs },
          emit: emitFromConfirmed(prev.appName, prev.sinceMs, nowMs),
        };
      }
      if (label === "study") {
        // 학습 앱으로 돌아왔다.
        // 이 한 샘플의 delta만으로도 이미 60초 이상 학습에 머문 것이라면(폴링 간격이 크거나
        // 재개 후 첫 샘플이라면) recovering 단계를 거치지 않고 곧바로 세그먼트 확정 종료.
        if (deltaMs >= thresholds.recoveryHoldMs) {
          return {
            next: initialState,
            emit: emitFromConfirmed(prev.appName, prev.sinceMs, nowMs),
          };
        }
        // 아니라면 recovering으로 전이해 60초 카운터를 시작한다.
        // 60초 안에 같은 앱으로 돌아오면 이 세그먼트가 되살아난다 (카톡 잠깐 대답).
        return {
          next: {
            kind: "recovering",
            pendingApp: prev.appName,
            pendingDurationMs: prev.sinceMs,
            pendingStartedAtMs: nowMs - prev.sinceMs,
            recoveryMs: deltaMs,
          },
        };
      }
      // neutral: confirmed 유지 (파인더 잠깐 열기가 세그먼트를 종료시키지 않는다).
      return { next: prev };
    }

    case "recovering": {
      if (distractive && appName === prev.pendingApp) {
        // 같은 딴짓 앱으로 돌아왔다 — pending 세그먼트를 이어서 진행.
        // 이때 recovery 동안의 시간은 딴짓 시간에 포함하지 않는다 (사용자는 실제로 학습 앱을 봤다).
        return {
          next: {
            kind: "confirmed",
            appName: prev.pendingApp,
            sinceMs: prev.pendingDurationMs + deltaMs,
          },
        };
      }
      if (distractive && appName && appName !== prev.pendingApp) {
        // 다른 딴짓 앱으로 갔다 — 이전을 emit하고 새 후보 시작.
        return {
          next: { kind: "candidate", appName, sinceMs: deltaMs },
          emit: emitFromRecovering(prev, nowMs),
        };
      }
      if (label === "study") {
        const nextRecovery = prev.recoveryMs + deltaMs;
        if (nextRecovery >= thresholds.recoveryHoldMs) {
          // 60초 채웠다 — 세그먼트 확정 종료.
          return {
            next: initialState,
            emit: emitFromRecovering(prev, nowMs),
          };
        }
        return { next: { ...prev, recoveryMs: nextRecovery } };
      }
      // neutral: recovery도 진행 안 함. 파인더로 잠깐 나갔다 돌아오는 케이스에서
      // 60초 카운터가 잘못 진행되는 것을 막는다.
      return { next: prev };
    }
  }
};

/**
 * EmittedSegment → DistractionSegment.
 * caller가 sessionId와 uuid를 채워 넣는다.
 */
export const toDistractionSegment = (
  emit: EmittedSegment,
  meta: { id: string; sessionId: string }
): DistractionSegment => ({
  id: meta.id,
  sessionId: meta.sessionId,
  appName: emit.appName,
  label: emit.label,
  startedAt: new Date(emit.startedAtMs).toISOString(),
  endedAt: new Date(emit.endedAtMs).toISOString(),
  durationSec: emit.durationSec,
  confirmed: emit.confirmed,
});
