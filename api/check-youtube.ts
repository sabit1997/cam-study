import type { VercelRequest, VercelResponse } from "@vercel/node";

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Vercel Node 함수는 application/json 요청을 req.body로 자동 파싱한다.
    const body = req.body as { videoId?: unknown } | null | undefined;
    const videoId = typeof body?.videoId === "string" ? body.videoId : undefined;

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
