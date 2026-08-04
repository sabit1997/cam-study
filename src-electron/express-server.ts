import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import type { AddressInfo } from "net";

const BACKEND_URL = "https://api.oeyo-cam.site";
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
// 빌드 시 esbuild --define으로 주입. 개발(Vite) 환경에서는 process.env로 폴백.
declare const __YOUTUBE_API_KEY__: string | undefined;
const YOUTUBE_API_KEY: string | undefined =
  typeof __YOUTUBE_API_KEY__ !== "undefined"
    ? __YOUTUBE_API_KEY__
    : process.env.YOUTUBE_API_KEY;

export function createExpressApp(staticDir: string) {
  const app = express();
  app.use(express.static(staticDir));

  // express.json()을 전역으로 걸면 request 스트림이 소비되어 아래 프록시가
  // 백엔드로 body를 못 넘긴다(→ 504). JSON 파싱이 실제로 필요한 라우트에만 적용.
  app.post("/api/check-youtube", express.json(), async (req, res) => {
    const { videoId } = req.body as { videoId?: string };

    if (!videoId || !YOUTUBE_ID_RE.test(videoId)) {
      res.status(400).json({ error: "유효하지 않은 YouTube 영상 ID입니다." });
      return;
    }

    if (!YOUTUBE_API_KEY) {
      res.status(500).json({ error: "YouTube API 키가 설정되지 않았습니다." });
      return;
    }

    try {
      const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      apiUrl.searchParams.set("id", videoId);
      apiUrl.searchParams.set("key", YOUTUBE_API_KEY);
      apiUrl.searchParams.set("part", "status,snippet");

      const response = await fetch(apiUrl.toString());
      const data = await response.json() as {
        items?: Array<{ status: { embeddable: boolean }; snippet?: { title?: string } }>;
      };

      const item = data.items?.[0];
      if (item) {
        res.json({ isEmbeddable: item.status.embeddable, title: item.snippet?.title ?? null });
      } else {
        res.json({ isEmbeddable: false, title: null });
      }
    } catch {
      res.status(500).json({ error: "영상 정보를 가져오는 데 실패했습니다." });
    }
  });

  // 나머지 /api/* → 백엔드 프록시 (Cookie 헤더 자동 포워딩)
  // 패키징된 Electron은 http://localhost:<랜덤포트>에서 실행돼 클라이언트
  // Origin이 백엔드 whitelist에 없어 403이 난다. proxyReq에서 Origin/Referer를
  // 제거해 백엔드가 서버-투-서버 호출처럼 취급하도록 한다.
  app.use(
    "/api",
    createProxyMiddleware({
      target: BACKEND_URL,
      changeOrigin: true,
      pathRewrite: { "^/api": "" },
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.removeHeader("origin");
          proxyReq.removeHeader("referer");
        },
      },
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
