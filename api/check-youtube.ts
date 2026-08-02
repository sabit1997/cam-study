import type { VercelRequest, VercelResponse } from "@vercel/node";

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { videoId } = req.body as { videoId?: string };

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

  try {
    const response = await fetch(apiUrl.toString());
    const data = await response.json() as {
      items?: Array<{ status: { embeddable: boolean }; snippet?: { title?: string } }>;
    };

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      res.json({ isEmbeddable: item.status.embeddable, title: item.snippet?.title ?? null });
    } else {
      res.json({ isEmbeddable: false, title: null });
    }
  } catch (error) {
    console.error("YouTube API Error:", error);
    res.status(500).json({ error: "영상 정보를 가져오는 데 실패했습니다." });
  }
}
