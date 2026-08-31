// 앱 모드는 빌드타임에 결정된다. VITE_APP_MODE=local 로 빌드하면 서버 의존성을
// 우회하고 localStorage/electron-store로만 동작한다. 이 파일이 export하는 상수는
// 빌드타임 리터럴이라 IS_LOCAL_MODE로 감싼 반대 모드 코드는 번들에서 tree-shake 된다.

const raw = (import.meta.env.VITE_APP_MODE ?? "").toString().toLowerCase();

export const APP_MODE: "local" | "server" = raw === "local" ? "local" : "server";

export const IS_LOCAL_MODE = APP_MODE === "local";
