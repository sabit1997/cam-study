/**
 * Vercel 배포 전 lockfile 제거 스크립트.
 *
 * macOS에서 생성된 lockfile에는 darwin/arm64 전용 optional 패키지들이
 * 기록되어 있고, npm 10.9+(Node.js 22)는 Linux x64에서 이를 처리할 때
 * path.relative(undefined, ...) → ERR_INVALID_ARG_TYPE 으로 충돌한다.
 *
 * 부분 패치(darwin 항목 제거)를 시도해도 linux-arm64 전용 패키지 등
 * 남은 불일치 항목들이 같은 오류를 유발한다.
 *
 * 해결: lockfile 자체를 제거 → npm이 Linux x64 환경에 맞게 fresh resolve.
 */
const fs = require("fs");
const { execSync } = require("child_process");

const lockPath = "package-lock.json";

if (fs.existsSync(lockPath)) {
  fs.unlinkSync(lockPath);
  console.log("vercel-install: removed package-lock.json, resolving fresh for Linux x64");
}

execSync("npm install --ignore-scripts", { stdio: "inherit" });
