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
              const { text, purpose } = JSON.parse(body) as {
                text?: unknown;
                purpose?: unknown;
              };
              // Vite의 모듈 파이프라인으로 로드한다. 설정 파일에서 직접 import하면
              // 설정 로더가 TS/ESM을 CJS로 취급해 경고가 나고, 앞으로는 아예 깨진다.
              // 이렇게 하면 server/ 코드를 고쳐도 개발 서버를 재시작할 필요가 없다.
              const { interpret, isPurpose } = (await server.ssrLoadModule(
                "/server/ai-interpret.ts"
              )) as typeof import("./server/ai-interpret");
              const p = isPurpose(purpose) ? purpose : undefined;
              const result = await interpret(text, {
                apiKey: geminiApiKey,
                ...(p ? { purpose: p } : {}),
              });
              if (!result.ok) {
                // reason·retryAfterSec를 함께 넘겨 daily/minute/server를 클라이언트가 구분.
                send(result.status, {
                  error: result.error,
                  ...(result.reason ? { reason: result.reason } : {}),
                  ...(result.retryAfterSec !== undefined
                    ? { retryAfterSec: result.retryAfterSec }
                    : {}),
                });
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
      {
        // 개발 환경(Vite) 어댑터 — 온보딩 대화 SSE 스트림.
        // 배포 환경 어댑터는 api/onboarding-chat.ts(웹)와 src-electron/express-server.ts.
        // 헤더를 즉시 flush하고 chunk마다 write해 브라우저가 순차적으로 받게 한다.
        name: "onboarding-chat",
        configureServer(server) {
          server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            if (req.url !== "/api/onboarding-chat" || req.method !== "POST") {
              next();
              return;
            }
            if (!geminiApiKey) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }));
              return;
            }
            try {
              const body = await readBody(req);
              const parsed = JSON.parse(body) as unknown;
              const { streamOnboardingChat } = (await server.ssrLoadModule(
                "/server/onboarding-chat.ts"
              )) as typeof import("./server/onboarding-chat");

              res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
              });

              const send = (obj: object) => {
                res.write(`data: ${JSON.stringify(obj)}\n\n`);
              };

              const result = await streamOnboardingChat(parsed, {
                apiKey: geminiApiKey,
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
              res.end();
            } catch (err) {
              console.error("[onboarding-chat]", err);
              // 응답이 이미 시작됐다면 SSE 안에서 에러를 보내고, 아니면 JSON 500.
              if (res.headersSent) {
                res.write(`data: ${JSON.stringify({ type: "error", status: 500, error: "AI 요청 처리에 실패했습니다." })}\n\n`);
                res.end();
              } else {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "AI 요청 처리에 실패했습니다." }));
              }
            }
          });
        },
      },
      {
        // 개발 환경(Vite) 어댑터. Gemini 그라운딩 검색을 태워 유튜브 강의 후보를 뽑는다.
        // 배포 환경 어댑터는 api/youtube-search.ts, 데스크탑은 express-server.ts.
        name: "youtube-search",
        configureServer(server) {
          server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            if (req.url !== "/api/youtube-search" || req.method !== "POST") {
              next();
              return;
            }
            const send = (status: number, body: object) => {
              res.writeHead(status, { "Content-Type": "application/json" });
              res.end(JSON.stringify(body));
            };
            if (!geminiApiKey) {
              send(500, { error: "GEMINI_API_KEY가 설정되지 않았습니다." });
              return;
            }
            try {
              const body = await readBody(req);
              const parsed = JSON.parse(body) as unknown;
              const { searchYoutube } = (await server.ssrLoadModule(
                "/server/youtube-search.ts"
              )) as typeof import("./server/youtube-search");
              const result = await searchYoutube(parsed, { apiKey: geminiApiKey });
              if (!result.ok) {
                // reason·retryAfterSec를 함께 넘겨 daily/minute/server를 클라이언트가 구분.
                send(result.status, {
                  error: result.error,
                  ...(result.reason ? { reason: result.reason } : {}),
                  ...(result.retryAfterSec !== undefined
                    ? { retryAfterSec: result.retryAfterSec }
                    : {}),
                });
                return;
              }
              send(200, { candidates: result.candidates });
            } catch (err) {
              console.error("[youtube-search]", err);
              send(500, { error: "유튜브 검색에 실패했습니다." });
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
      rollupOptions: {
        output: {
          // tanstack query 는 QueryClientProvider 를 통해 eager 로 참조되므로
          // 항상 로드된다. 별도 청크로 격리하지 않으면 index 진입 청크에 통째로
          // 편입돼 lazy 로 뺀 다른 코드(예: zod)의 감량이 지워진다.
          // (docs/lightening-analysis.md §3)
          //
          // Rolldown 은 rollup 의 함수형 manualChunks 대신 advancedChunks.groups
          // 스펙만 지원한다.
          advancedChunks: {
            groups: [
              {
                name: "tanstack-query",
                test: /node_modules[\\/]@tanstack[\\/]/,
              },
              // recharts 격리는 rolldown 청크링과 궁합이 안 맞는다.
              // 시도했더니 recharts 청크가 공용 vendor 로 오인돼 홈 로딩에서
              // preload 되면서 홈 transfer +42% 회귀. 원상 복구 후 별도 이슈로
              // "record 페이지 내에서 recharts 를 dynamic import" 스파이크.
            ],
          },
        },
      },
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
