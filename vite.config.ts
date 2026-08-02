import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  root: ".",
  publicDir: "public",
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
      "^/api/check-youtube$": {
        target: "https://cam-study.vercel.app",
        changeOrigin: true,
      },
      // /api 또는 /api/... 만 프록시 (/apis/ 소스 파일 경로는 제외)
      "^/api(/|$)": {
        target: "https://api.oeyo-cam.site",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
