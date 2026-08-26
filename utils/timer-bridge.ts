/**
 * 타이머 창과 바깥(명령 팔레트 실행기)을 잇는 다리.
 *
 * 왜 스토어로 리프팅하지 않았는가:
 * components/timer.tsx의 상태는 interval 핸들·세션 시작 시각·서버 flush 타이밍처럼
 * "그 창의 수명에 묶인 것"이 대부분이다. 창이 여러 개 열릴 수 있으므로 전역 스토어 하나로
 * 옮기면 두 번째 타이머 창이 첫 번째의 인터벌을 덮어쓴다. 그래서 상태는 창 안에 두고,
 * 창 id로 식별되는 **명령 창구**만 밖으로 낸다.
 *
 * ai-action-runner.tsx가 실행기를 currentRun 슬롯으로 내놓는 것과 같은 방식이고,
 * 다른 점은 창마다 하나씩이라 Map이라는 것뿐이다.
 *
 * 이 파일은 React를 import하지 않는다 — 순수 레지스트리라서 단독으로 테스트된다.
 */

/**
 * 두 명령 모두 "말한 대로 됐는가"를 boolean으로 돌려준다.
 * void였다면 실행기는 시작되지 않았을 때도 성공 토스트를 띄운다 — 승인 UI가 있으나 마나가 된다.
 */
export interface TimerCommands {
  /** 집중·휴식 분을 적용하고 포모도로를 처음부터 시작한다. 이미 돌고 있으면 새 설정으로 다시 시작한다. */
  startPomodoro: (workMins: number, breakMins: number) => boolean;
  /** 스톱워치 탭으로 전환하고 계측을 시작한다. 이미 돌고 있으면 그 상태를 유지한다. */
  startStopwatch: () => boolean;
}

/** 창 id → 그 창이 내놓은 명령 창구 */
const registry = new Map<number, TimerCommands>();

/** 아직 마운트되지 않은 창을 기다리는 쪽들 */
const waiters = new Map<number, Set<(commands: TimerCommands) => void>>();

/** 창이 마운트되기까지 기다려주는 최대 시간. lazy 청크 로드 + 첫 렌더를 감안한 값. */
export const TIMER_READY_TIMEOUT_MS = 5000;

/**
 * 타이머 창이 마운트되면서 자기 명령 창구를 등록한다.
 * @returns 등록 해제 함수 (언마운트 시 호출)
 */
export const registerTimerCommands = (
  windowId: number,
  commands: TimerCommands
): (() => void) => {
  registry.set(windowId, commands);

  // 이 창을 기다리던 쪽이 있으면 지금 깨운다.
  const pending = waiters.get(windowId);
  if (pending) {
    waiters.delete(windowId);
    for (const resolve of pending) resolve(commands);
  }

  return () => {
    // 리마운트로 이미 다른 창구가 들어와 있으면 그것을 지우면 안 된다.
    if (registry.get(windowId) === commands) registry.delete(windowId);
  };
};

export const getTimerCommands = (windowId: number): TimerCommands | null =>
  registry.get(windowId) ?? null;

/**
 * 창이 명령을 받을 준비가 될 때까지 기다린다.
 *
 * 방금 만든 창은 서버 응답 → 쿼리 무효화 → 리페치 → 렌더 → lazy 청크 로드를 거쳐야
 * 마운트된다. 그 사이에 명령을 쏘면 아무 일도 일어나지 않으므로 등록을 기다린다.
 * 시간 안에 준비되지 않으면 거절한다 — 실행기가 이 실패를 사용자에게 그대로 보고한다.
 */
export const waitForTimerCommands = (
  windowId: number,
  timeoutMs: number = TIMER_READY_TIMEOUT_MS
): Promise<TimerCommands> => {
  const ready = registry.get(windowId);
  if (ready) return Promise.resolve(ready);

  return new Promise((resolve, reject) => {
    // 두 콜백이 서로를 참조하지만 둘 다 나중에야 실행되므로 순서는 문제되지 않는다.
    const timeoutId = setTimeout(() => {
      const pending = waiters.get(windowId);
      pending?.delete(onReady);
      if (pending?.size === 0) waiters.delete(windowId);
      reject(new Error("타이머 창이 제때 준비되지 않았습니다."));
    }, timeoutMs);

    const onReady = (commands: TimerCommands) => {
      // 이걸 걷어내지 않으면 준비가 끝난 뒤에도 타이머가 남아 프로세스를 붙든다.
      clearTimeout(timeoutId);
      resolve(commands);
    };

    const pending = waiters.get(windowId) ?? new Set<(c: TimerCommands) => void>();
    pending.add(onReady);
    waiters.set(windowId, pending);
  });
};

/** 테스트 전용 — 레지스트리를 비운다. 대기 중인 약속은 타임아웃으로 정리된다. */
export const resetTimerBridge = () => {
  registry.clear();
  waiters.clear();
};
