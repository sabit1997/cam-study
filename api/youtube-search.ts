import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchYoutube } from "../server/youtube-search";
import { createRateLimiter } from "../server/rate-limit";

/**
 * 웹(Vercel) 배포용 어댑터. server/youtube-search가 실제 로직을 담고,
 * 여기서는 접근 통제와 HTTP 껍데기만 담당한다(api/ai-interpret.ts와 같은 패턴).
 *
 * 유튜브 검색은 그라운딩 검색을 태우므로 무료 티어 quota를 두 배 소비한다.
 * 그래서 IP 레이트리밋도 명령 해석보다 낮게 잡아뒀다.
 */

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ?? "https://www.oeyo-cam.site,https://oeyo-cam.site"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const SESSION_COOKIE_NAMES = (
  process.env.SESSION_COOKIE_NAMES ?? "AccessToken,RefreshToken"
)
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

// 검색은 명령 해석보다 무거우니 분당 5건.
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

const clientIp = (req: VercelRequest): string => {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
};

const cookieNames = (cookieHeader: string | undefined): string[] =>
  (cookieHeader ?? "")
    .split(";")
    .map((p) => p.split("=")[0]?.trim() ?? "")
    .filter(Boolean);

const hasSessionCookie = (names: string[]): boolean => {
  const expected = SESSION_COOKIE_NAMES.map((n) => n.toLowerCase());
  return names.some((n) => expected.includes(n.toLowerCase()));
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({ error: "허용되지 않은 요청입니다." });
    return;
  }

  const names = cookieNames(req.headers.cookie);
  if (!hasSessionCookie(names)) {
    res.status(401).json({ error: "로그인이 필요한 기능입니다." });
    return;
  }

  const verdict = limiter(clientIp(req), Date.now());
  if (!verdict.allowed) {
    // 우리 서버 IP 레이트리밋에서 온 429. 클라이언트가 Gemini의 daily/minute와 구분해서
    // 안내할 수 있도록 reason: "server"로 라벨링.
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
    const result = await searchYoutube(req.body);
    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.retryAfterSec !== undefined
          ? { retryAfterSec: result.retryAfterSec }
          : {}),
      });
      return;
    }
    res.json({ candidates: result.candidates });
  } catch (error) {
    console.error("[youtube-search] handler crashed:", error);
    res.status(500).json({ error: "유튜브 검색에 실패했습니다." });
  }
}
