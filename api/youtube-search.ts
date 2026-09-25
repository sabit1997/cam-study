import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchYoutube } from "../server/youtube-search";
import { createRateLimiter } from "../server/rate-limit";
import { verifyTurnstileToken } from "../server/turnstile";

/**
 * 웹(Vercel) 배포용 어댑터. server/youtube-search가 실제 로직을 담고,
 * 여기서는 접근 통제와 HTTP 껍데기만 담당한다(api/ai-interpret.ts와 같은 패턴).
 *
 * 유튜브 검색은 YouTube Data API v3 search.list를 태운다. 무료 quota는 하루 10,000
 * 유닛(≈100회 search)라 명령 해석보다 여유 있지만, 스팸 방지 목적의 IP 레이트리밋은
 * 그대로 유지한다.
 */

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ?? "https://www.oeyo-cam.site,https://oeyo-cam.site"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// 검색은 명령 해석보다 무거우니 분당 5건.
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

const clientIp = (req: VercelRequest): string => {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
};

const headerString = (
  value: string | string[] | undefined
): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
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

  // 브라우저 요청은 Turnstile 필수. 앱 프록시(Origin 없음)는 이 층을 건너뛴다.
  if (origin) {
    const token = headerString(req.headers["cf-turnstile-token"]);
    const verdict = await verifyTurnstileToken(token, clientIp(req));
    if (!verdict.success) {
      res.status(403).json({
        error: "봇 검증에 실패했습니다. 잠시 후 다시 시도해주세요.",
        reason: "turnstile",
        ...(verdict.errorCodes
          ? { turnstileErrors: verdict.errorCodes }
          : {}),
      });
      return;
    }
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

  if (!process.env.YOUTUBE_API_KEY) {
    res.status(500).json({ error: "YouTube API 키가 설정되지 않았습니다." });
    return;
  }

  try {
    const result = await searchYoutube(req.body, {
      apiKey: process.env.YOUTUBE_API_KEY,
    });
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
