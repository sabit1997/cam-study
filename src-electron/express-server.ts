import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";

const BACKEND_URL = "https://api.oeyo-cam.site";
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export async function startExpressServer(staticDir: string, port: number): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(express.static(staticDir));

  // YouTube API 키 은닉 엔드포인트
  app.post("/api/check-youtube", async (req, res) => {
    const { videoId } = req.body as { videoId?: string };

    if (!videoId || !YOUTUBE_ID_RE.test(videoId)) {
      res.status(400).json({ error: "유효하지 않은 YouTube 영상 ID입니다." });
      return;
    }

    const API_KEY = process.env.YOUTUBE_API_KEY ?? "";
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
      const item = data.items?.[0];
      res.json({
        isEmbeddable: item?.status.embeddable ?? false,
        title: item?.snippet?.title ?? null,
      });
    } catch {
      res.status(500).json({ error: "영상 정보를 가져오는 데 실패했습니다." });
    }
  });

  // 나머지 /api/* → 백엔드 프록시 (Cookie 헤더 자동 포워딩)
  app.use(
    "/api",
    createProxyMiddleware({
      target: BACKEND_URL,
      changeOrigin: true,
      pathRewrite: { "^/api": "" },
    })
  );

  // SPA 폴백
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
}
