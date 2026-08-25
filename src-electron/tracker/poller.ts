/**
 * 포그라운드 앱 이름을 주기적으로 폴링한다.
 *
 * ## 왜 get-windows인가 (설계 문서 §2.1)
 * - `activeWindow({ accessibilityPermission: false, screenRecordingPermission: false })`로 호출하면
 *   앱 이름(`owner.name`)만 얻고 창 제목·URL·화면 픽셀은 요청조차 하지 않는다.
 * - 그 결과 macOS Screen Recording · Accessibility 권한 프롬프트가 뜨지 않는다.
 *
 * ## dynamic import
 * get-windows v9는 ESM 전용인데 Electron main은 CommonJS로 컴파일된다.
 * 최상위 `import` 대신 첫 사용 시 `await import()`로 로드한다.
 *
 * ## 이 파일이 하지 않는 것
 * - 상태 머신 · 라벨 매칭 · 저장 — 각각 별도 모듈에서 처리.
 * - 이벤트 브로드캐스트 — index.ts가 담당.
 * poller는 "5초마다 이름 하나 뽑기"만 안다.
 */

export interface Poller {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

type ActiveWindowFn = (options: {
  accessibilityPermission?: boolean;
  screenRecordingPermission?: boolean;
}) => Promise<{ owner: { name: string } } | undefined>;

/** get-windows 모듈을 한 번만 로드해서 캐시. */
let cachedActiveWindow: ActiveWindowFn | null = null;

const loadActiveWindow = async (): Promise<ActiveWindowFn> => {
  if (cachedActiveWindow) return cachedActiveWindow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import("get-windows")) as any;
  cachedActiveWindow = (mod.activeWindow ?? mod.default?.activeWindow) as ActiveWindowFn;
  if (!cachedActiveWindow) {
    throw new Error("get-windows에서 activeWindow를 찾지 못했습니다.");
  }
  return cachedActiveWindow;
};

export interface CreatePollerOptions {
  intervalMs: number;
  /**
   * 폴링 성공 시 콜백. appName은 null일 수 있다(포그라운드 없음 · 권한 실패).
   * 재진입 방지를 위해 콜백이 진행 중이면 다음 tick을 스킵한다.
   */
  onSample: (appName: string | null, timestamp: number) => void;
  /** 오류 로깅 훅. 프로덕션에서 노이즈를 피하려고 caller가 주입 가능. */
  onError?: (error: unknown) => void;
}

export const createPoller = (opts: CreatePollerOptions): Poller => {
  let handle: ReturnType<typeof setInterval> | null = null;
  let busy = false;

  const tick = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const activeWindow = await loadActiveWindow();
      const result = await activeWindow({
        accessibilityPermission: false,
        screenRecordingPermission: false,
      });
      const appName = result?.owner?.name ?? null;
      opts.onSample(appName, Date.now());
    } catch (error) {
      // get-windows가 실패해도 폴링 자체는 유지한다. 다음 tick에 회복될 수 있다.
      opts.onError?.(error);
      opts.onSample(null, Date.now());
    } finally {
      busy = false;
    }
  };

  return {
    start(): void {
      if (handle) return;
      // 첫 tick을 즉시 한 번 돌려 상태 머신에 초기 샘플을 준다.
      void tick();
      handle = setInterval(tick, opts.intervalMs);
    },
    stop(): void {
      if (handle) {
        clearInterval(handle);
        handle = null;
      }
    },
    isRunning(): boolean {
      return handle !== null;
    },
  };
};
