import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "http";

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export default defineConfig(({ mode }) => {
  // loadEnv에 세 번째 인자 ""를 주면 VITE_ 접두사 없는 변수도 모두 로드한다
  const env = loadEnv(mode, process.cwd(), "");
  const youtubeApiKey = env.YOUTUBE_API_KEY ?? "";
  const geminiApiKey = env.GEMINI_API_KEY ?? "";

  return {
    plugins: [
      react(),
      {
        name: "check-youtube",
        configureServer(server) {
          server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            if (req.url !== "/api/check-youtube" || req.method !== "POST") {
              next();
              return;
            }
            const send = (status: number, body: object) => {
              res.writeHead(status, { "Content-Type": "application/json" });
              res.end(JSON.stringify(body));
            };
            if (!youtubeApiKey) {
              send(500, { error: "YouTube API 키가 설정되지 않았습니다." });
              return;
            }
            try {
              const body = await readBody(req);
              const { videoId } = JSON.parse(body) as { videoId?: string };
              if (!videoId || !YOUTUBE_ID_RE.test(videoId)) {
                send(400, { error: "유효하지 않은 YouTube 영상 ID입니다." });
                return;
              }
              const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
              apiUrl.searchParams.set("id", videoId);
              apiUrl.searchParams.set("key", youtubeApiKey);
              apiUrl.searchParams.set("part", "status,snippet");

              const ytRes = await fetch(apiUrl.toString());
              const data = await ytRes.json() as {
                items?: Array<{ status: { embeddable: boolean }; snippet?: { title?: string } }>;
              };
              const item = data.items?.[0];
              if (item) {
                send(200, { isEmbeddable: item.status.embeddable, title: item.snippet?.title ?? null });
              } else {
                send(200, { isEmbeddable: false, title: null });
              }
            } catch (err) {
              console.error("[check-youtube]", err);
              send(500, { error: "영상 정보를 가져오는 데 실패했습니다." });
            }
          });
        },
      },
      {
        // 개발 환경(Vite) 어댑터. 배포 환경 어댑터는 api/ai-interpret.ts(웹)와
        // src-electron/express-server.ts(데스크탑 프록시)에 있다.
        // 해석 로직 자체는 server/ai-interpret.ts 한 곳에만 있다.
        name: "ai-interpret",
        configureServer(server) {
          server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            if (req.url !== "/api/ai-interpret" || req.method !== "POST") {
              next();
              return;
            }
            const send = (status: number, body: object) => {
              res.writeHead(status, { "Content-Type": "application/json" });
              res.end(JSON.stringify(body));
            };
            if (!geminiApiKey) {
              send(500, { error: "GEMINI_API_KEY가 설정되지 않았습니다. .env를 확인하세요." });
              return;
            }
            try {
              const body = await readBody(req);
              const { text } = JSON.parse(body) as { text?: unknown };
              // Vite의 모듈 파이프라인으로 로드한다. 설정 파일에서 직접 import하면
              // 설정 로더가 TS/ESM을 CJS로 취급해 경고가 나고, 앞으로는 아예 깨진다.
              // 이렇게 하면 server/ 코드를 고쳐도 개발 서버를 재시작할 필요가 없다.
              const { interpret } = (await server.ssrLoadModule(
                "/server/ai-interpret.ts"
              )) as typeof import("./server/ai-interpret");
              const result = await interpret(text, { apiKey: geminiApiKey });
              if (!result.ok) {
                send(result.status, { error: result.error });
                return;
              }
              send(200, { actions: result.actions });
            } catch (err) {
              console.error("[ai-interpret]", err);
              send(500, { error: "AI 요청 처리에 실패했습니다." });
            }
          });
        },
      },
    ],
    root: ".",
    publicDir: "public",
    resolve: {
      tsconfigPaths: true,
    },
    // react-rnd 등 일부 패키지가 process.env.NODE_ENV를 참조함
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "development"),
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      proxy: {
        // /api 또는 /api/... 만 프록시 (/apis/ 소스 파일 경로는 제외)
        "^/api(/|$)": {
          target: "https://api.oeyo-cam.site",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
