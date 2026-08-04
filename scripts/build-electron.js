// src-electron/ 번들 빌드 스크립트.
// esbuild CLI 대신 JS API를 사용해 --define 값에 shell 이스케이프 문제가 없도록 한다.
// YOUTUBE_API_KEY: .env 파일(로컬) 또는 환경 변수(CI)에서 읽는다.
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

function loadDotenv() {
  const root = path.join(__dirname, "..");
  // Vite 우선순위와 동일: .env.local → .env
  for (const name of [".env.local", ".env"]) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadDotenv();

const ytKey = process.env.YOUTUBE_API_KEY ?? "";
if (!ytKey) {
  console.warn("[build-electron] 경고: YOUTUBE_API_KEY가 설정되지 않았습니다.");
}

esbuild
  .build({
    entryPoints: [
      "src-electron/main.ts",
      "src-electron/preload.ts",
    ],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    external: ["electron", "fsevents"],
    outdir: "dist-electron",
    define: {
      __YOUTUBE_API_KEY__: JSON.stringify(ytKey),
    },
  })
  .then(() => {
    console.log("[build-electron] 빌드 완료");
  })
  .catch((err) => {
    console.error("[build-electron] 빌드 실패:", err);
    process.exit(1);
  });
