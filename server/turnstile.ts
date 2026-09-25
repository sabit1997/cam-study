/**
 * Cloudflare Turnstile 서버 검증.
 *
 * 원래 서버 모드에서 세션 쿠키가 하던 접근 통제(무인증 curl로 quota 소진 방지)를,
 * 로컬 모드에서는 브라우저 대상으로 Turnstile 토큰 검증으로 대체한다. 앱 프록시처럼
 * Origin 헤더가 없는 요청은 이 함수를 호출하지 않고 IP 레이트리밋에만 맡긴다.
 *
 * Vercel Node·Edge 런타임 양쪽에서 동작해야 하므로 fetch만 쓴다. axios나 Node-only
 * 모듈은 사용하지 않는다.
 */

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes?: string[];
}

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // 서버 설정 누락 — 배포 직후 이 실수가 조용히 열리지 않도록 fail-closed.
    // 클라이언트에는 봇 검증 실패로 보이지만 서버 로그에서 원인을 구분할 수 있다.
    console.warn("[turnstile] TURNSTILE_SECRET_KEY가 설정되지 않았습니다.");
    return { success: false, errorCodes: ["missing-secret"] };
  }
  if (!token) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }
  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  if (remoteIp) params.set("remoteip", remoteIp);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      return {
        success: false,
        errorCodes: [`siteverify-http-${res.status}`],
      };
    }
    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    return {
      success: data.success === true,
      ...(data["error-codes"] ? { errorCodes: data["error-codes"] } : {}),
    };
  } catch (err) {
    console.error("[turnstile] siteverify 네트워크 오류:", err);
    return { success: false, errorCodes: ["network-error"] };
  }
}
