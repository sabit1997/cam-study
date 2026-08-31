import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import axios from "axios";
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

// AI 해석은 데스크탑에서 직접 하지 않고 웹 배포본의 엔드포인트로 넘긴다.
// Anthropic API 키를 배포 바이너리에 넣지 않기 위해서다(누구나 꺼내볼 수 있다).
declare const __AI_PROXY_URL__: string | undefined;
const AI_PROXY_URL: string =
  (typeof __AI_PROXY_URL__ !== "undefined" ? __AI_PROXY_URL__ : process.env.AI_PROXY_URL) ?? "";

// 앱 모드. 로컬 모드에서는 AI/백엔드 프록시 라우트를 아예 등록하지 않는다.
declare const __APP_MODE__: string | undefined;
const APP_MODE =
  typeof __APP_MODE__ !== "undefined"
    ? __APP_MODE__
    : (process.env.VITE_APP_MODE ?? "server");
const IS_LOCAL_MODE = APP_MODE === "local";

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
      const { data } = await axios.get<{
        items?: Array<{ status: { embeddable: boolean }; snippet?: { title?: string } }>;
      }>("https://www.googleapis.com/youtube/v3/videos", {
        params: { id: videoId, key: YOUTUBE_API_KEY, part: "status,snippet" },
      });

      const item = data.items?.[0];
      if (item) {
        res.json({ isEmbeddable: item.status.embeddable, title: item.snippet?.title ?? null });
      } else {
        res.json({ isEmbeddable: false, title: null });
      }
    } catch (err) {
      console.error("[check-youtube]", err);
      res.status(500).json({ error: "영상 정보를 가져오는 데 실패했습니다." });
    }
  });

  // 로컬 모드에서는 AI/백엔드 프록시가 필요 없다 — 렌더러의 도메인 서비스가
  // 로컬 어댑터로 대체돼 /api/* 호출이 발생하지 않는다. 정적 서빙만 하는 서버.
  if (IS_LOCAL_MODE) {
    // SPA 폴백만 남기고 반환. Express 5에서는 app.get("*")가 라우트 등록 시
    // 예외를 던지므로 app.use로 매치한다.
    app.use((_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
    return app;
  }

  // AI 해석 → 웹 배포본으로 프록시. 반드시 아래의 포괄 /api 프록시보다 위에 있어야 한다.
  app.post("/api/ai-interpret", express.json(), async (req, res) => {
    if (!AI_PROXY_URL) {
      res.status(500).json({
        error: "AI 엔드포인트가 설정되지 않았습니다. 빌드 시 AI_PROXY_URL이 필요합니다.",
      });
      return;
    }

    try {
      const upstream = await axios.post(
        `${AI_PROXY_URL.replace(/\/$/, "")}/api/ai-interpret`,
        req.body,
        {
          headers: {
            "Content-Type": "application/json",
            // 상류(api/ai-interpret.ts)는 세션 쿠키가 있는 요청만 받는다.
            // 렌더러가 보낸 쿠키를 그대로 넘겨야 그 게이트를 통과한다.
            // Origin은 붙이지 않는다 — 상류는 Origin 없는 서버-투-서버 호출을 허용한다.
            ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
          },
          validateStatus: () => true,
        }
      );
      // 상태 코드를 그대로 넘긴다. 429(레이트 리밋)나 422(거부)를 200으로 만들면
      // 클라이언트가 실패를 성공으로 오해한다.
      res.status(upstream.status).json(upstream.data);
    } catch (err) {
      console.error("[ai-interpret]", err);
      res.status(502).json({ error: "AI 요청을 전달하지 못했습니다." });
    }
  });

  // 유튜브 검색 → 웹 배포본으로 프록시. AI 해석과 같은 이유로 데스크탑에서 직접 실행하지 않는다.
  app.post("/api/youtube-search", express.json(), async (req, res) => {
    if (!AI_PROXY_URL) {
      res.status(500).json({
        error: "AI 엔드포인트가 설정되지 않았습니다. 빌드 시 AI_PROXY_URL이 필요합니다.",
      });
      return;
    }

    try {
      const upstream = await axios.post(
        `${AI_PROXY_URL.replace(/\/$/, "")}/api/youtube-search`,
        req.body,
        {
          headers: {
            "Content-Type": "application/json",
            ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
          },
          validateStatus: () => true,
        }
      );
      res.status(upstream.status).json(upstream.data);
    } catch (err) {
      console.error("[youtube-search]", err);
      res.status(502).json({ error: "유튜브 검색 요청을 전달하지 못했습니다." });
    }
  });

  // 온보딩 대화 → 웹 배포본으로 SSE 프록시. axios responseType: "stream"으로 받아
  // 청크가 도착할 때마다 렌더러에 그대로 흘려보낸다. 헤더도 통째로 전달해야
  // 브라우저 fetch가 SSE로 인식한다.
  app.post("/api/onboarding-chat", express.json(), async (req, res) => {
    if (!AI_PROXY_URL) {
      res.status(500).json({
        error: "AI 엔드포인트가 설정되지 않았습니다. 빌드 시 AI_PROXY_URL이 필요합니다.",
      });
      return;
    }
    try {
      const upstream = await axios.post(
        `${AI_PROXY_URL.replace(/\/$/, "")}/api/onboarding-chat`,
        req.body,
        {
          responseType: "stream",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
          },
          validateStatus: () => true,
        }
      );
      res.status(upstream.status);
      // 필수 SSE 헤더만 forward — Content-Type·Cache-Control·X-Accel-Buffering.
      // 나머지(예: transfer-encoding)는 Node http가 다시 세팅한다.
      const ct = upstream.headers["content-type"];
      if (typeof ct === "string") res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      // Node http는 첫 write()까지 헤더 전송을 보류한다. 그러면 upstream의 첫 chunk가
      // 도착할 때까지 브라우저가 응답 시작을 인지 못해 SSE의 이점이 사라진다.
      // pipe 직전에 명시적으로 flush.
      res.flushHeaders();

      // 렌더러가 fetch abort로 연결을 끊으면 upstream Gemini 스트림도 곧바로 종료해야
      // quota가 헛되이 소비되지 않는다. res 또는 원 요청이 닫히면 upstream을 destroy.
      const cleanup = () => {
        upstream.data.destroy();
      };
      res.on("close", cleanup);
      req.on("close", cleanup);

      upstream.data.pipe(res);
    } catch (err) {
      console.error("[onboarding-chat]", err);
      if (!res.headersSent) {
        res.status(502).json({ error: "AI 요청을 전달하지 못했습니다." });
      } else {
        res.end();
      }
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
