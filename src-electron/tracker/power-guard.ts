import { powerMonitor } from "electron";

/**
 * powerMonitor 이벤트 → 상태 머신 이벤트로 변환.
 *
 * 왜 별도 파일인가:
 * - Electron API를 직접 만지는 유일한 지점을 좁혀두려는 것. 상태 머신·저장·폴러는 순수하다.
 * - 잠금/절전은 딴짓 감지의 정확도에 크게 영향을 준다 — "5분 카톡"이 실제로는 4분 카톡 + 1분 절전인
 *   케이스를 여기서 잘라내야 한다.
 *
 * 폴러 자체는 계속 돌지만, 상태 머신에 넘길 delta를 0으로 만드는 방식으로 시간을 얼린다
 * (session-store의 freezeSession/recordSample 참고).
 */

export interface PowerHandlers {
  onSuspend(nowMs: number): void;
  onResume(nowMs: number): void;
  onLock(nowMs: number): void;
  onUnlock(nowMs: number): void;
}

export const attachPowerMonitor = (handlers: PowerHandlers): (() => void) => {
  const onSuspend = () => handlers.onSuspend(Date.now());
  const onResume = () => handlers.onResume(Date.now());
  const onLock = () => handlers.onLock(Date.now());
  const onUnlock = () => handlers.onUnlock(Date.now());

  powerMonitor.on("suspend", onSuspend);
  powerMonitor.on("resume", onResume);
  powerMonitor.on("lock-screen", onLock);
  powerMonitor.on("unlock-screen", onUnlock);

  return () => {
    powerMonitor.off("suspend", onSuspend);
    powerMonitor.off("resume", onResume);
    powerMonitor.off("lock-screen", onLock);
    powerMonitor.off("unlock-screen", onUnlock);
  };
};
