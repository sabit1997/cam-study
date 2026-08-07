# YouTube API 키 관리

## 개요

유튜브 창에서 영상을 추가할 때 YouTube Data API v3로 영상 정보(제목, 임베드 가능 여부)를 확인한다. 개발·패키지 앱은 직접 호출하고, 배포 웹은 Vercel Serverless Function이 호출한다.

| 환경 | 키 출처 | 처리 주체 |
| --- | --- | --- |
| 개발 (Vite dev server) | `.env.local`의 `YOUTUBE_API_KEY` | `vite.config.mts` 커스텀 미들웨어 |
| 패키지 앱 (Electron) | `.env.local` → esbuild `--define` 번들 주입 | `express-server.ts` |
| 배포 웹 (Vercel) | Vercel Project Environment Variable의 `YOUTUBE_API_KEY` | `api/check-youtube.ts` |
| GitHub Actions CI | `secrets.YOUTUBE_API_KEY` → esbuild `--define` 번들 주입 | `express-server.ts` |

## 호출 흐름

### 개발 환경 (Vite dev server)

```
렌더러 → fetch("/api/check-youtube")
  → vite.config.mts configureServer 미들웨어 (프록시보다 먼저 실행)
  → YouTube Data API v3 (.env.local의 키 사용)
```

### 패키지 앱 (Electron)

```
렌더러 → fetch("/api/check-youtube")
  → Express 서버 (express-server.ts)
  → YouTube Data API v3 (axios, 빌드 시 번들에 주입된 키 사용)
```

> **주의**: Express 서버에서 YouTube API 호출 시 Node.js 내장 `fetch` 대신 `axios`를 사용한다. Electron 43 메인 프로세스에서 내장 `fetch`의 HTTPS 요청이 불안정하여 throw가 발생하는 문제가 HAR 분석으로 확인됐기 때문이다. Vite 미들웨어는 Electron 외부(Node.js 프로세스)에서 실행되므로 내장 `fetch`를 그대로 사용한다.

### 배포 웹 (Vercel)

```
렌더러 → fetch("/api/check-youtube")
  → Vercel Serverless Function (api/check-youtube.ts)
  → YouTube Data API v3 (Vercel 환경 변수의 키 사용)
```

Vercel Node 함수는 `Content-Type: application/json` 요청을 `req.body`로 자동 파싱한다. 이미 파싱된 요청 스트림을 다시 읽으면 응답이 끝난 뒤 이벤트를 기다려 함수가 시간 초과될 수 있으므로, 이 엔드포인트는 `req.body`만 사용한다.

## 로컬 개발 설정

`.env.local`에 키가 있으면 된다. 이미 설정되어 있으므로 별도 작업 불필요.

```
YOUTUBE_API_KEY=AIzaSy...
```

## GitHub Actions 설정

저장소 **Settings → Secrets and variables → Actions**에서 `YOUTUBE_API_KEY` secret을 등록한다. 등록하지 않으면 릴리즈 빌드에서 API 키가 빈 문자열로 주입되어 패키지 앱에서 YouTube 영상 추가가 실패한다.

## Vercel 배포 설정

Vercel 프로젝트의 **Settings → Environment Variables**에 `YOUTUBE_API_KEY`를 Production 환경으로 등록한 뒤 재배포한다. 이 값이 없으면 함수는 JSON `500` 응답을 반환하며, `FUNCTION_INVOCATION_FAILED`는 키 누락이 아니라 함수가 응답을 끝내지 못한 경우를 먼저 확인한다.

## Vite 미들웨어 동작 방식

`vite.config.mts`의 `configureServer` 훅에서 `/api/check-youtube` 전용 미들웨어를 등록한다. Vite 내부 미들웨어(프록시 포함)보다 먼저 실행되므로, 해당 경로는 백엔드 프록시로 넘어가지 않는다. `loadEnv(mode, cwd, "")` 세 번째 인자 `""`로 `VITE_` 접두사 없는 변수도 로드한다.

## esbuild 번들 주입 동작 방식

`scripts/build-electron.js`는 esbuild CLI 대신 JS API를 사용한다. shell 이스케이프 없이 `define` 옵션에 직접 값을 넘길 수 있어 macOS·Windows CI 양쪽에서 동일하게 동작한다.

```js
esbuild.build({
  // ...
  define: {
    __YOUTUBE_API_KEY__: JSON.stringify(ytKey),
  },
});
```

번들된 코드에서 `__YOUTUBE_API_KEY__`는 문자열 리터럴로 교체된다.

`express-server.ts`에서는 `typeof` 가드로 esbuild `--define`이 적용되지 않은 환경(Vitest 등)을 처리한다.

```ts
declare const __YOUTUBE_API_KEY__: string | undefined;
const YOUTUBE_API_KEY =
  typeof __YOUTUBE_API_KEY__ !== "undefined"
    ? __YOUTUBE_API_KEY__
    : process.env.YOUTUBE_API_KEY;
```

## 관련 파일

| 파일 | 역할 |
| --- | --- |
| `vite.config.mts` | 개발 환경 `/api/check-youtube` 미들웨어 |
| `scripts/build-electron.js` | `.env.local` 로드 + esbuild 번들 + API 키 주입 |
| `src-electron/express-server.ts` | 패키지 앱에서 YouTube Data API v3 직접 호출 |
| `api/check-youtube.ts` | Vercel 배포 웹의 YouTube 검증 함수 |
| `.github/workflows/release.yml` | CI에서 `YOUTUBE_API_KEY` secret 주입 |
