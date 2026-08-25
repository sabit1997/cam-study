import type { VercelRequest, VercelResponse } from "@vercel/node";
import { interpret, isPurpose } from "../server/ai-interpret";
import { createRateLimiter } from "../server/rate-limit";

/**
 * 웹(Vercel) 배포용 어댑터.
 *
 * 실제 해석은 server/ai-interpret.ts가 한다. 여기는 HTTP만 담당한다 —
 * 그래서 접근 통제도 해석기가 아니라 이 파일에 있다.
 * GEMINI_API_KEY는 Vercel 프로젝트 환경변수로만 존재하고 클라이언트로 나가지 않는다.
 *
 * 주의: vercel.json의 rewrite가 /api/* 를 백엔드로 넘기므로, 이 경로는 거기서 제외돼 있어야 한다.
 *
 * ## 왜 게이트가 필요한가
 *
 * 이 엔드포인트는 유료 자원(Gemini 무료 티어 일일 할당량)을 소비한다. 인증이 없으면
 * 외부인이 curl 한 줄로 그날 할당량을 태울 수 있고, 그 순간 모든 사용자의 AI 기능이 죽는다.
 *
 * ## 각 층이 실제로 막는 것 (과신하지 않기 위해 적어둔다)
 *
 * - Origin 허용목록: 다른 **웹사이트**가 브라우저에서 이 엔드포인트를 쓰는 것.
 *   Origin 헤더가 없는 요청은 통과시켜야 한다(데스크탑 Express 프록시가 그렇다).
 *   따라서 curl은 막지 못한다.
 * - 세션 쿠키: 쿠키의 **존재 여부**만 본다. 암호학적 검증은 요청마다 백엔드 왕복이
 *   필요해 명령 지연을 늘린다. 위조 쿠키는 이 층을 통과하지만 다음 층에 걸린다.
 * - IP 레이트리밋: 실질적인 방어선. 위조할 수 없는 플랫폼 헤더를 키로 쓴다.
 *   단 인메모리라 인스턴스별이다(server/rate-limit.ts의 한계 설명 참고).
 */

/** 브라우저에서 이 엔드포인트를 호출해도 되는 오리진 */
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ?? "https://www.oeyo-cam.site,https://oeyo-cam.site"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** 백엔드가 내려주는 인증 쿠키 이름 (docs/auto-login.md) */
const SESSION_COOKIE_NAMES = (
  process.env.SESSION_COOKIE_NAMES ?? "AccessToken,RefreshToken"
)
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

/**
 * 사람이 팔레트를 쓰는 속도로는 절대 닿지 않고, 스크립트로는 곧 닿는 값.
 * 한 번의 명령이 요청 1건이므로 분당 10건이면 충분히 넉넉하다.
 */
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

const clientIp = (req: VercelRequest): string => {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  // x-forwarded-for는 "client, proxy1, proxy2" 형태다. 맨 앞이 클라이언트다.
  return raw?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
};

const cookieNames = (cookieHeader: string | undefined): string[] =>
  (cookieHeader ?? "")
    .split(";")
    .map((pair) => pair.split("=")[0]?.trim() ?? "")
    .filter(Boolean);

/**
 * 이름 비교는 대소문자를 무시한다.
 *
 * 이 게이트가 잘못 잠기면 로그인한 사용자 전원이 AI를 못 쓴다. 백엔드가 쿠키 이름의
 * 표기를 바꾸는 것만으로 그런 일이 벌어지는 게 가장 흔한 실패라, 표기 차이는 흡수한다.
 * 이름 자체가 다르면 SESSION_COOKIE_NAMES 환경변수로 맞춘다.
 */
const hasSessionCookie = (names: string[]): boolean => {
  const expected = SESSION_COOKIE_NAMES.map((name) => name.toLowerCase());
  return names.some((name) => expected.includes(name.toLowerCase()));
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Origin이 있는데 목록에 없으면 다른 사이트에서 온 것이다.
  // 서버-투-서버 호출(데스크탑 프록시)은 Origin이 없으므로 통과시킨다.
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({ error: "허용되지 않은 요청입니다." });
    return;
  }

  const names = cookieNames(req.headers.cookie);
  if (!hasSessionCookie(names)) {
    // 값은 절대 남기지 않고 이름만 남긴다. 쿠키 이름이 어긋나 게이트가 잘못 잠긴 경우와
    // 정말 비로그인 요청인 경우를 로그만 보고 구분할 수 있어야 한다.
    console.warn(
      "[ai-interpret] 세션 쿠키 없음 — 받은 쿠키 이름:",
      names.length > 0 ? names.join(",") : "(없음)"
    );
    res.status(401).json({ error: "로그인이 필요한 기능입니다." });
    return;
  }

  const verdict = limiter(clientIp(req), Date.now());
  if (!verdict.allowed) {
    // 우리 서버 IP 레이트리밋에서 온 429. Gemini의 daily/minute와 구분해야 클라이언트가
    // 오해 없는 안내를 낼 수 있다. reason: "server"로 표기하고 실제 재시도 시간을 넘긴다.
    res.setHeader("Retry-After", String(verdict.retryAfterSec));
    res.status(429).json({
      error: `요청이 너무 많아요. ${verdict.retryAfterSec}초 후에 다시 시도해주세요.`,
      reason: "server",
      retryAfterSec: verdict.retryAfterSec,
    });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: "AI API 키가 설정되지 않았습니다." });
    return;
  }

  try {
    const body = req.body as
      | { text?: unknown; purpose?: unknown }
      | null
      | undefined;
    // purpose는 화이트리스트만 허용. 알 수 없는 값이 오면 조용히 기본값으로 떨어뜨린다.
    // 잘못된 문자열로 429를 던져 사용자에게 노출할 이유가 없다.
    const purpose = isPurpose(body?.purpose) ? body.purpose : undefined;
    const result = await interpret(body?.text, purpose ? { purpose } : {});

    if (!result.ok) {
      // reason·retryAfterSec가 있으면 함께 전달 — 클라이언트가 daily/minute/server를 구분해
      // 안내 문구를 조정할 수 있다.
      res.status(result.status).json({
        error: result.error,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.retryAfterSec !== undefined
          ? { retryAfterSec: result.retryAfterSec }
          : {}),
      });
      return;
    }
    res.json({ actions: result.actions });
  } catch (error) {
    console.error("[ai-interpret] handler crashed:", error);
    res.status(500).json({ error: "AI 요청 처리에 실패했습니다." });
  }
}
