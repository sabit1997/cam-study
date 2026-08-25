// Electron 개발 실행 래퍼.
//
// electron 바이너리는 서명이 없어서 Windows Smart App Control이나 회사 정책(WDAC/AppLocker)이
// 실행을 막는 경우가 있다. 그때 raw 스택 트레이스를 뱉고 exit 1을 하면 concurrently -k가
// 웹 개발 서버까지 같이 죽여서, 데스크탑 기능이 필요 없는 작업까지 통째로 막힌다.
//
// 주의: spawn 실패는 두 경로로 온다.
//   - 동기 throw       : UNKNOWN 등. Node가 spawn() 호출 지점에서 바로 던진다.
//   - 비동기 error 이벤트: ENOENT 등. Node가 이벤트로 미룬다.
// 둘 다 막아야 한다. 하나만 처리하면 다른 쪽에서 그대로 터진다.
const { spawn } = require("child_process");
const electron = require("electron");

/** 실행 자체가 차단·불가한 경우. 앱이 뜬 뒤의 오류는 여기 해당하지 않는다. */
const BLOCKED = new Set(["UNKNOWN", "EPERM", "EACCES", "ENOENT"]);

function reportBlocked(err) {
  console.warn(
    [
      "",
      "[dev:electron] Electron을 실행할 수 없어 건너뜁니다.",
      `  (${err.code}: ${err.message})`,
      "",
      "  서명 없는 실행 파일을 OS가 차단한 경우입니다.",
      "  Windows에서 확인하려면 PowerShell에서:",
      "    (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy').VerifiedAndReputablePolicyState",
      "    → 1이면 Smart App Control이 켜져 있어 차단합니다.",
      "",
      "  웹 개발 서버는 계속 동작합니다. 대부분의 기능은 브라우저에서 확인할 수 있고,",
      "  전역 단축키·화면 공유 소스 조회 같은 데스크탑 전용 기능만 확인이 불가합니다.",
      "",
    ].join("\n")
  );
}

/** 웹 개발 서버를 살려두기 위해 정상 종료로 빠진다 */
function skip(err) {
  reportBlocked(err);
  process.exit(0);
}

let child;
try {
  child = spawn(electron, ["."], { stdio: "inherit" });
} catch (err) {
  // 동기 throw 경로 (Windows의 spawn UNKNOWN이 여기로 온다)
  if (BLOCKED.has(err.code)) skip(err);
  console.error("[dev:electron] 실행 실패:", err);
  process.exit(1);
}

child.on("error", (err) => {
  // 비동기 이벤트 경로
  if (BLOCKED.has(err.code)) skip(err);
  console.error("[dev:electron] 실행 실패:", err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) return;
  process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child?.kill(sig));
}
