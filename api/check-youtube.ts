import type { VercelRequest, VercelResponse } from "@vercel/node";

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

// Vercel Node 런타임은 Content-Type이 application/json일 때 req.body를 자동 파싱하지만,
// 이 프로젝트 배포에서 undefined로 넘어와 destructuring 크래시(FUNCTION_INVOCATION_FAILED)가
// 나던 이력이 있음. 자동 파싱·문자열 body·raw stream 모든 경로를 커버한다.
async function readJsonBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === "object") {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === "string" && req.body.length > 0) {
    try { return JSON.parse(req.body) as Record<string, unknown>; } catch { return {}; }
  }
  return await new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 어떤 예외도 응답 없이 던지지 않도록 최상위 try-catch로 감싼다.
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const body = await readJsonBody(req);
    const videoId = typeof body.videoId === "string" ? body.videoId : undefined;

    if (!videoId || !YOUTUBE_ID_RE.test(videoId)) {
      res.status(400).json({ error: "유효하지 않은 YouTube 영상 ID입니다." });
      return;
    }

    const API_KEY = process.env.YOUTUBE_API_KEY;
    if (!API_KEY) {
      res.status(500).json({ error: "YouTube API 키가 설정되지 않았습니다." });
      return;
    }

    const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    apiUrl.searchParams.set("id", videoId);
    apiUrl.searchParams.set("key", API_KEY);
    apiUrl.searchParams.set("part", "status,snippet");

    const response = await fetch(apiUrl.toString());
    const data = (await response.json()) as {
      items?: Array<{ status: { embeddable: boolean }; snippet?: { title?: string } }>;
    };

    const item = data.items?.[0];
    if (item) {
      res.json({ isEmbeddable: item.status.embeddable, title: item.snippet?.title ?? null });
    } else {
      res.json({ isEmbeddable: false, title: null });
    }
  } catch (error) {
    console.error("[check-youtube] handler crashed:", error);
    res.status(500).json({
      error: "check-youtube handler failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
