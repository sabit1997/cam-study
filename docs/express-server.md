# 패키지 앱에서 Express 서버를 쓰는 이유

`src-electron/express-server.ts`는 배포된 Electron 앱 안에서 React 빌드 결과물(`dist/`)을 제공하고 API 요청을 중계하는 로컬 서버다. 개발 환경의 Vite 서버를 대체한다.

## 동작 구조

```text
Electron renderer
  └─ http://localhost:<랜덤 포트>
       ├─ 정적 파일 / SPA 화면 → dist/
       ├─ /api/check-youtube → Vercel 검증 API
       └─ /api/* → https://api.oeyo-cam.site
```

앱 시작 시 `main.ts`가 빈 포트를 하나 할당받아 Express를 실행하고, 그 주소를 BrowserWindow에 로드한다. 고정 포트를 쓰지 않으므로 다른 프로그램과의 포트 충돌을 피할 수 있다.

## 필요한 이유

### 1. 패키지 앱에서도 웹앱을 제공

개발 중에는 Vite가 React 파일을 제공하지만, 설치된 앱에는 Vite 개발 서버가 없다. Express가 `dist/`의 정적 파일을 제공하고, 알 수 없는 경로는 `index.html`로 돌려 React Router의 SPA 경로 이동을 지원한다.

### 2. 백엔드 CORS/Origin 문제 회피

패키지 앱은 매번 `localhost:<랜덤 포트>`에서 실행된다. 이 주소는 백엔드의 브라우저 Origin 허용 목록에 없을 수 있다. `/api/*` 요청을 로컬 Express가 백엔드로 전달하면서 `Origin`과 `Referer` 헤더를 제거하면, 백엔드는 서버 간 요청으로 처리할 수 있다.

### 3. 로그인 쿠키 전달

렌더러의 Axios 요청은 같은 로컬 Origin의 `/api/*`로 보낸다. Express 프록시는 Cookie 헤더를 백엔드로 전달하므로, 로그인·토큰 갱신·사용자별 데이터 요청이 기존 웹 API와 같은 방식으로 동작한다.

### 4. YouTube 검증 요청을 별도 처리

`/api/check-youtube`만은 Vercel API로 직접 전달하고, 요청 본문을 검증한다. 나머지 프록시 요청 전에 전역 `express.json()`을 적용하면 요청 스트림이 먼저 소비되어 백엔드에 본문이 전달되지 않으므로, JSON 파싱은 이 경로에만 적용한다.

## 관련 파일

| 파일 | 역할 |
| --- | --- |
| `src-electron/express-server.ts` | 정적 파일, SPA 폴백, API 프록시 |
| `src-electron/main.ts` | Express 시작 후 BrowserWindow에 로컬 URL 로드 |
| `apis/request.ts` | 렌더러에서 `/api`를 기준으로 Axios 요청 |

## 주의점

로컬 서버 포트는 재시작 때 달라질 수 있다. 따라서 `localStorage`처럼 Origin(포트 포함)에 묶이는 저장소는 앱 재실행 후 직접적인 영속 저장소로 쓰면 안 된다. 인증 토큰은 Electron 세션 쿠키로, 포트와 무관하게 유지해야 한다.
