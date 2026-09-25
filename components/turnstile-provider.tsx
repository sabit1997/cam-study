import { useEffect, useRef } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useTurnstileStore } from "@/stores/turnstile-state";

/**
 * Cloudflare Turnstile 위젯을 invisible 모드로 상주시켜 백그라운드에서 토큰을 발급받는다.
 *
 * ## 왜 invisible인가
 * 사용자가 명시적으로 체크박스를 누르지 않아도 브라우저 신호(마우스·타이핑·User-Agent
 * 등)로 Cloudflare가 사람 여부를 판정한다. 실사용자 UX는 방해받지 않고, 헤드리스 봇은
 * 실패한다. 문제가 있을 때만 챌린지가 뜨는 managed 대비, invisible은 아예 렌더링이 없다.
 *
 * ## 마운트 조건
 * 사이트 키(VITE_TURNSTILE_SITE_KEY)가 없으면 null을 반환한다. 데스크탑 앱(Electron)
 * 렌더러에서는 상위에서 아예 이 컴포넌트를 마운트하지 않는다(src/App.tsx가 electronAPI
 * 유무로 판정한다). 여기서는 방어 로직 없이 사이트 키만 체크한다.
 */
export default function TurnstileProvider() {
  const ref = useRef<TurnstileInstance | null>(null);
  const setToken = useTurnstileStore((s) => s.setToken);
  const setReset = useTurnstileStore((s) => s.setReset);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as
    | string
    | undefined;

  useEffect(() => {
    // 위젯 ref가 실제로 준비된 이후 스토어에 reset 클로저를 심는다.
    // 언마운트 시 청소해 stale 참조가 남지 않게 한다.
    setReset(() => ref.current?.reset());
    return () => setReset(null);
  }, [setReset]);

  if (!siteKey) {
    if (import.meta.env.DEV) {
      console.warn(
        "[turnstile] VITE_TURNSTILE_SITE_KEY가 설정되지 않아 위젯을 마운트하지 않습니다. AI 호출은 봇 검증 실패로 막힙니다."
      );
    }
    return null;
  }

  return (
    <Turnstile
      ref={ref}
      siteKey={siteKey}
      options={{
        size: "invisible",
        theme: "auto",
        retry: "auto",
      }}
      onSuccess={(token) => setToken(token)}
      onExpire={() => setToken(null)}
      onError={() => setToken(null)}
    />
  );
}
