import type { VercelRequest, VercelResponse } from "@vercel/node";
import { streamOnboardingChat } from "../server/onboarding-chat";
import { createRateLimiter } from "../server/rate-limit";

/**
 * 웹(Vercel) 배포용 어댑터 — SSE 스트림.
 *
 * 실제 로직은 server/onboarding-chat.ts. 여기는 HTTP 껍데기와 접근 통제만.
 *
 * ## SSE 헤더 주의사항
 * - `X-Accel-Buffering: no` : nginx·CloudFront 계열 프록시가 응답을 버퍼링해
 *   스트리밍이 chunk 단위로 흐르지 않는 문제를 예방한다.
 * - `flushHeaders()` : @vercel/node의 VercelResponse에 있는 헬퍼. 헤더를 즉시
 *   내려보내 클라 fetch가 곧바로 reader를 열 수 있게 한다.
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

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

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

  if (!hasSessionCookie(cookieNames(req.headers.cookie))) {
    res.status(401).json({ error: "로그인이 필요한 기능입니다." });
    return;
  }

  const verdict = limiter(clientIp(req), Date.now());
  if (!verdict.allowed) {
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

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.status(200);
  if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as unknown as { flushHeaders: () => void }).flushHeaders();
  }

  const send = (obj: object) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    const result = await streamOnboardingChat(req.body, {
      apiKey: process.env.GEMINI_API_KEY,
      onDelta: (text) => send({ type: "delta", text }),
    });
    if (result.ok) {
      send({
        type: "done",
        reply: result.reply,
        visibleText: result.visibleText,
      });
    } else {
      send({ type: "error", ...result });
    }
  } catch (err) {
    console.error("[onboarding-chat] handler crashed:", err);
    send({ type: "error", status: 500, error: "AI 요청 처리에 실패했습니다." });
  }
  res.end();
}
