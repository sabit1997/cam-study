import { streamOnboardingChat } from "../server/onboarding-chat";
import { createRateLimiter } from "../server/rate-limit";

/**
 * 웹(Vercel) 배포용 어댑터 — SSE 스트림.
 *
 * ## 왜 Edge Runtime인가
 * Vercel의 Node.js 서버리스는 응답을 버퍼링해 한 번에 flush하는 경향이 있다.
 * `res.flushHeaders()`만으로는 청크 단위 flush를 보장하지 않아, 첫 delta가 도착할 때까지
 * 브라우저가 응답 시작조차 인지 못하는 경우가 잦다. Edge Runtime은 Web API의
 * ReadableStream을 그대로 흘려보내므로 실질적 스트리밍이 보장된다.
 *
 * ## 트레이드오프
 * - `@google/genai`는 browser export를 가지고 있어 Edge에서 동작한다.
 * - server/rate-limit.ts, gemini-quota.ts는 Node-only API를 쓰지 않는다.
 * - process.env는 Edge Runtime에서도 접근 가능.
 * - 인메모리 rate-limit의 정확성은 Node 때와 동일 — "정확한 상한이 아니라 남용 억제 장치".
 */

// @vercel/static-config가 ts-morph로 이 객체를 읽는다. 문자열·숫자·불리언·배열·객체
// 리터럴만 이해하므로 `as const`나 `satisfies`를 붙이면
//   Unhandled type: "AsExpression" "edge" as const
// 로 죽고 runtime 지정이 통째로 무시된다. 리터럴 그대로 둔다.
export const config = { runtime: "edge" };

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

const jsonResponse = (status: number, body: object): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const cookieNames = (cookieHeader: string | null): string[] =>
  (cookieHeader ?? "")
    .split(";")
    .map((p) => p.split("=")[0]?.trim() ?? "")
    .filter(Boolean);

const hasSessionCookie = (names: string[]): boolean => {
  const expected = SESSION_COOKIE_NAMES.map((n) => n.toLowerCase());
  return names.some((n) => expected.includes(n.toLowerCase()));
};

const clientIp = (request: Request): string => {
  // Vercel Edge는 x-forwarded-for에 실제 클라이언트 IP를 실어 준다.
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return jsonResponse(403, { error: "허용되지 않은 요청입니다." });
  }

  if (!hasSessionCookie(cookieNames(request.headers.get("cookie")))) {
    return jsonResponse(401, { error: "로그인이 필요한 기능입니다." });
  }

  const verdict = limiter(clientIp(request), Date.now());
  if (!verdict.allowed) {
    return new Response(
      JSON.stringify({
        error: `요청이 너무 많아요. ${verdict.retryAfterSec}초 후에 다시 시도해주세요.`,
        reason: "server",
        retryAfterSec: verdict.retryAfterSec,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Retry-After": String(verdict.retryAfterSec),
        },
      }
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    return jsonResponse(500, { error: "AI API 키가 설정되지 않았습니다." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "요청 본문이 JSON이 아닙니다." });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // 클라이언트가 abort로 이미 끊었을 수 있다. 조용히 넘긴다.
        }
      };
      try {
        const result = await streamOnboardingChat(body, {
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
        // Edge Runtime에는 console이 있지만 로그가 짧게 잘릴 수 있다. 형식 최소화.
        console.error("[onboarding-chat] edge handler crashed:", err);
        send({
          type: "error",
          status: 500,
          error: "AI 요청 처리에 실패했습니다.",
        });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // 이미 닫혔거나 오류로 닫힌 경우는 무시
        }
      }
    },
    cancel() {
      // 클라이언트가 fetch abort로 스트림을 취소하면 여기로 온다.
      // streamOnboardingChat에 취소 신호를 넘기는 경로가 없어 최소 대응.
      // (앞으로 AbortSignal 지원을 추가하면 여기서 취소 처리)
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
