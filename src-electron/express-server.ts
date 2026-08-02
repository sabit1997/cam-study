import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import type { AddressInfo } from "net";

const BACKEND_URL = "https://api.oeyo-cam.site";
const YOUTUBE_CHECK_URL = "https://cam-study.vercel.app/api/check-youtube";
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function createExpressApp(staticDir: string) {
  const app = express();
  app.use(express.json());
  app.use(express.static(staticDir));

  // Vercel 함수가 YouTube API 키를 보관한다. 데스크톱 앱에는 키를 넣지 않는다.
  app.post("/api/check-youtube", async (req, res) => {
    const { videoId } = req.body as { videoId?: string };

    if (!videoId || !YOUTUBE_ID_RE.test(videoId)) {
      res.status(400).json({ error: "유효하지 않은 YouTube 영상 ID입니다." });
      return;
    }

    try {
      const response = await fetch(YOUTUBE_CHECK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      const data = await response.json();
      res.status(response.status).json(data);
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

  // SPA 폴백. Express 5에서는 app.get("*")가 라우트 등록 시 예외를 던진다.
  app.use((_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  return app;
}

// 실제 바인딩된 포트를 반환 (port 0 → OS가 빈 포트 자동 할당)
export async function startExpressServer(staticDir: string): Promise<number> {
  const app = createExpressApp(staticDir);

  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
    server.on("error", reject);
  });
}
