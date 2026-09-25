import { create } from "zustand";

/**
 * Cloudflare Turnstile 토큰 저장소.
 *
 * TurnstileProvider가 위젯 콜백으로 setToken을 채우고, AI 서비스가 요청 직전에
 * getToken()으로 최신 토큰을 꺼내 헤더에 실어 보낸다. Turnstile 토큰은 서버에서
 * siteverify에 한 번 쓰이고 무효화되므로, 사용 직후 consumeToken()을 호출해
 * 스토어를 비우고 위젯 reset을 트리거해야 한다.
 *
 * 앱(Electron)에서는 TurnstileProvider가 마운트되지 않아 token/reset이 계속
 * 비어 있다. AI 서비스는 electronAPI 유무로 이 스토어 사용 여부를 결정한다.
 */
interface TurnstileStore {
  token: string | null;
  /** TurnstileProvider가 마운트되며 위젯 인스턴스의 reset() 클로저를 넘긴다. */
  reset: (() => void) | null;
  setToken: (token: string | null) => void;
  setReset: (reset: (() => void) | null) => void;
  /**
   * 스토어에 토큰이 있으면 즉시 반환하고, 없으면 위젯이 발급할 때까지 대기한다.
   * 타임아웃을 넘기면 reject. 위젯이 마운트되지 않은 환경(사이트 키 미설정 등)에서
   * 무한 대기를 피하려면 반드시 timeout을 준다.
   */
  getToken: (timeoutMs?: number) => Promise<string>;
  /** 서버 siteverify에 토큰을 넘긴 뒤 호출한다. 스토어 비우고 위젯 재발급 유도. */
  consumeToken: () => void;
}

export const useTurnstileStore = create<TurnstileStore>()((set, get) => ({
  token: null,
  reset: null,
  setToken: (token) => set({ token }),
  setReset: (reset) => set({ reset }),
  getToken: (timeoutMs = 20_000) => {
    const current = get().token;
    if (current) return Promise.resolve(current);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error("Turnstile 토큰을 얻지 못했습니다."));
      }, timeoutMs);
      const unsub = useTurnstileStore.subscribe((state) => {
        if (state.token) {
          clearTimeout(timer);
          unsub();
          resolve(state.token);
        }
      });
    });
  },
  consumeToken: () => {
    set({ token: null });
    // 위젯을 리셋해 새 토큰을 받도록 트리거. reset이 없으면(앱/미마운트 상황)
    // 조용히 넘어간다 — 어차피 다음 호출도 electron 분기로 헤더 없이 나간다.
    get().reset?.();
  },
}));
