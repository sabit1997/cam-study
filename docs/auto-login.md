# 자동 로그인 (Auto Login)

명시적 로그아웃 없이 앱을 닫은 경우, 다음 진입 시 재로그인 없이 자동으로 세션을 복구한다.

---

## 목차

1. [전체 흐름](#전체-흐름)
2. [구현 위치 및 파일 구조](#구현-위치-및-파일-구조)
3. [함수별 상세 분석](#함수별-상세-분석)
4. [설계 결정 이유](#설계-결정-이유)
5. [apis/request.ts 인터셉터와의 관계](#apisrequestts-인터셉터와의-관계)
6. [Electron 환경 동작](#electron-환경-동작)
7. [트러블슈팅](#트러블슈팅)
8. [수동 테스트 방법](#수동-테스트-방법)

---

## 전체 흐름

```
앱 재진입 (AccessToken 만료 또는 없음)
    ↓
middleware.ts 실행 (클라이언트 JS 로드 전)
    ↓
pathname이 OPEN_PATHS(/download 등)?
    └── YES → 그대로 통과 (인증 불필요)

AccessToken 유효?
    ├── YES + 공개 페이지(/sign-in, /sign-up) → / 리다이렉트
    └── YES + 보호 페이지 → 그대로 통과
    
AccessToken 만료/없음
    → tryRefreshToken(cookieHeader) 호출
        ↓ (백엔드 NEXT_PUBLIC_API_URL/auth/refresh 직접 POST, 3초 타임아웃)
        ├── 성공 (2xx)
        │   ├── 공개 페이지 → / 리다이렉트 + Set-Cookie 부착
        │   └── 보호 페이지 → 그대로 통과 + Set-Cookie 부착
        └── 실패 (4xx / 타임아웃 / 네트워크 오류)
            ├── 공개 페이지 → 그대로 통과 (로그인 폼 표시)
            └── 보호 페이지 → /sign-in 리다이렉트
```

---

## 구현 위치 및 파일 구조

```
middleware.ts          ← 유일한 수정 파일. 자동 로그인 로직 전체 포함.
stores/user-state.tsx  ← 변경 없음. persist로 localStorage에 유저 정보 유지.
apis/request.ts        ← 변경 없음. 클라이언트 사이드 401 인터셉터 (별도 역할).
next.config.ts         ← 변경 없음. /api/* → 백엔드 rewrite 규칙 유지.
```

`middleware.ts`에는 세 개의 헬퍼 함수가 추가되었다.

| 함수 | 역할 |
|---|---|
| `isTokenValid(token)` | JWT payload의 `exp` 클레임으로 만료 여부 확인 (서명 검증 없음) |
| `tryRefreshToken(cookieHeader)` | 백엔드 `/auth/refresh`를 server-to-server로 호출. 성공 시 응답 Headers 반환, 실패·타임아웃 시 null |
| `forwardSetCookies(src, dest)` | 백엔드가 내려준 `Set-Cookie` 헤더를 미들웨어 응답에 부착 (Edge 런타임 호환 방식) |

---

## 함수별 상세 분석

### `isTokenValid(token: string): boolean`

```ts
function isTokenValid(token: string): boolean {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    if (!payload.exp) return true;
    return Date.now() < payload.exp * 1000;
  } catch {
    return false;
  }
}
```

**동작:**
- JWT를 `.` 기준으로 분리해 payload 부분(두 번째 세그먼트)을 Base64URL 디코딩한다.
- `exp` 클레임이 없으면 만료 기한 없는 토큰으로 간주해 `true` 반환.
- `exp * 1000`(Unix 초 → ms)과 `Date.now()`를 비교해 유효 여부 반환.
- 파싱 실패(손상된 토큰, 빈 문자열 등)는 모두 `false`.

**의도적 제약 — 서명 검증 없음:**  
Edge 런타임에서 `crypto.subtle`로 RS256 서명 검증이 기술적으로 가능하지만, 공개 키를 미들웨어에 직접 임베드하면 키 교체 시 재배포가 필요하고 코드가 복잡해진다. 서명 위조 차단은 백엔드 API 게이트웨이가 전담하므로, 미들웨어는 `exp` 확인만으로도 충분하다.

---

### `tryRefreshToken(cookieHeader: string): Promise<Headers | null>`

```ts
async function tryRefreshToken(cookieHeader: string): Promise<Headers | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl || !cookieHeader) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${apiUrl}/auth/refresh`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok ? res.headers : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}
```

**동작:**
- 환경변수 `NEXT_PUBLIC_API_URL`로 백엔드를 직접 호출 (Next.js rewrite 우회).
- 요청 헤더에 브라우저의 쿠키 전체(`Cookie` 헤더)를 그대로 포워딩해 RefreshToken이 전달되게 한다.
- **3초 타임아웃**: `AbortController`로 3초 초과 시 요청을 중단. 백엔드 장애나 네트워크 지연이 미들웨어를 무한 블로킹하는 것을 방지.
- `res.ok`(상태코드 200~299)일 때만 응답 `Headers` 반환, 나머지(4xx, 5xx)는 `null`.
- 타임아웃·네트워크 오류는 catch에서 `null` 반환.

**왜 `NEXT_PUBLIC_API_URL` 직접 호출인가:**  
`next.config.ts`의 rewrite는 `/api/auth/*` 경로를 백엔드로 포워딩한다. 그러나 미들웨어의 `matcher`가 `api` 경로를 제외하기 때문에, 미들웨어 내부에서 `/api/auth/refresh`로 self-call하면 rewrite가 동작하지 않거나 재귀 루프가 발생할 위험이 있다. 백엔드를 직접 호출하면 중간 레이어 없이 단일 요청으로 처리된다.

---

### `forwardSetCookies(src: Headers, dest: NextResponse)`

```ts
function forwardSetCookies(src: Headers, dest: NextResponse) {
  const cookies =
    typeof (src as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (src as { getSetCookie: () => string[] }).getSetCookie()
      : [src.get("set-cookie")].filter((c): c is string => c !== null);
  cookies.forEach((c) => dest.headers.append("Set-Cookie", c));
}
```

**동작:**
- 백엔드 응답의 `Set-Cookie` 헤더를 미들웨어 응답 객체(`NextResponse`)에 복사한다.
- 브라우저는 이 헤더를 받아 새 `AccessToken`(및 `RefreshToken`)을 쿠키에 저장한다.

**Edge 런타임 호환 처리:**  
Node.js 환경의 `fetch` Response는 복수의 `Set-Cookie` 헤더를 반환하는 비표준 메서드 `getSetCookie()`를 지원한다. Edge 런타임(Cloudflare Workers 계열)에서는 이 메서드가 없는 경우가 있으므로, 존재 여부를 먼저 확인해 폴백(`headers.get("set-cookie")`)으로 처리한다.

`headers.set` 대신 `headers.append`를 사용하는 이유: `Set-Cookie`는 동일 헤더 이름으로 여러 값이 올 수 있다 (AccessToken + RefreshToken 각각). `set`은 기존 값을 덮어쓰므로 `append`로 모두 누적한다.

---

### `middleware()` 메인 함수 — 분기 로직

```
pathname ∈ OPEN_PATHS          → NextResponse.next()  (early return)
isValid && isPublic             → redirect("/")
isValid && !isPublic            → NextResponse.next()
!isValid → tryRefreshToken()
  newHeaders !== null && isPublic  → redirect("/") + Set-Cookie
  newHeaders !== null && !isPublic → NextResponse.next() + Set-Cookie
  newHeaders === null && isPublic  → NextResponse.next()
  newHeaders === null && !isPublic → redirect("/sign-in")
```

**경로 분류:**

| 분류 | 경로 | 동작 |
|---|---|---|
| `OPEN_PATHS` | `/download` | 인증 완전 무시. 항상 통과. |
| `AUTH_ONLY_PUBLIC` | `/sign-in`, `/sign-up` | 로그인 상태면 `/`로 리다이렉트. |
| 보호 페이지 | 그 외 모든 경로 | 비로그인 시 `/sign-in`으로 리다이렉트. |

**pathname 정규화:**  
`pathname = request.nextUrl.pathname.replace(/\/$/, "")` — 트레일링 슬래시(예: `/sign-in/`)를 제거해 `/sign-in`과 동일하게 처리한다.

---

### `config.matcher`

```ts
export const config = {
  matcher: [
    "/((?!api|auth|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json).*)",
  ],
};
```

미들웨어가 실행되지 않는 경로:
- `/api/*` — Next.js API routes / rewrite 대상
- `/auth/*` — 인증 관련 엔드포인트 (루프 방지)
- `/_next/static`, `/_next/image` — 정적 에셋
- `favicon.ico`, `sw.js`, `manifest.json` — 브라우저 기본 요청

---

## 설계 결정 이유

### 왜 미들웨어에서 처리하는가?

`apis/request.ts`의 401 인터셉터도 자동 토큰 갱신을 지원하지만, 미들웨어 리다이렉트가 클라이언트 JavaScript 실행보다 먼저 수행된다. 즉:

```
1. 브라우저 → Next.js 서버 요청
2. middleware.ts 실행 ← 여기서 세션 복구
3. HTML 응답 전달
4. 클라이언트 JS 번들 로드 및 실행
5. React hydration
6. apis/request.ts 인터셉터 활성화
```

만료된 AccessToken으로 보호 페이지에 직접 접근하면, 인터셉터가 활성화되기 전에 미들웨어가 `/sign-in`으로 리다이렉트해 버린다. 미들웨어에서 처리하면 이 리다이렉트 자체를 막아 **로그인 화면 깜빡임 없이** 세션을 복구할 수 있다.

### 왜 `useUserStore`를 수정하지 않는가?

```ts
// stores/user-state.tsx
persist(
  ...,
  {
    name: "user-storage",
    storage: createJSONStorage(() => localStorage),
  }
)
```

`useUserStore`는 `localStorage`에 persist되어 앱 재시작 후에도 `isAuthenticated: true`와 유저 정보(`user`)가 그대로 유지된다. 스토어가 초기화되는 유일한 경우는 명시적 `logout()` 호출이다. 따라서 자동 로그인 성공 시 클라이언트 스토어는 이미 올바른 상태이므로 별도 복구 로직이 필요 없다.

---

## `apis/request.ts` 인터셉터와의 관계

두 레이어는 서로 다른 시점과 시나리오를 커버하며 **중복이 아닌 보완 관계**다.

| 구분 | middleware.ts | apis/request.ts 인터셉터 |
|---|---|---|
| 실행 시점 | 클라이언트 JS 로드 전 (SSR/Edge) | 클라이언트 JS 실행 중 (브라우저) |
| 커버 시나리오 | 페이지 최초 진입, 새로고침 | React 앱 실행 중 API 호출 시 401 |
| 갱신 엔드포인트 | `NEXT_PUBLIC_API_URL/auth/refresh` 직접 | `/api/auth/refresh` (Next.js rewrite 경유) |
| 실패 시 동작 | `/sign-in` 리다이렉트 | 로그아웃 처리 + `window.location.href` |
| 동시 요청 처리 | 없음 (요청 1건) | `failedQueue`로 큐잉, 갱신 후 일괄 재시도 |

**실행 흐름 예시 (세션 유지 성공):**

```
앱 재시작 → middleware 갱신 성공 → 페이지 로드 → React 마운트
→ API 호출 → 새 AccessToken 유효 → 인터셉터 개입 없음
```

**실행 흐름 예시 (앱 사용 중 토큰 만료):**

```
앱 사용 중 → API 호출 → 401 응답
→ request.ts 인터셉터 → /api/auth/refresh 호출 → 성공
→ 원래 요청 재시도 → 정상 응답
(미들웨어는 이미 통과된 상태이므로 개입 없음)
```

---

## Electron 환경 동작

Electron은 Chromium 엔진의 쿠키 저장소를 `app.getPath("userData")/Cookies` (SQLite)에 영속 저장한다. `Max-Age` 또는 `expires`가 설정된 쿠키는 앱 프로세스가 종료되어도 유지되며, 다음 실행 시 BrowserWindow가 동일 세션으로 시작된다.

따라서:
- `AccessToken` (단기, 예: 30분): 앱 재시작 후 만료 가능 → middleware가 RefreshToken으로 자동 갱신
- `RefreshToken` (장기, 예: 7일): 앱 재시작 후에도 유효 → 갱신의 근거

별도 Electron IPC 코드나 `main.ts` 수정 없이 웹 환경과 동일한 흐름으로 동작한다.

**단, `session`이 `in-memory`인 경우** (`webPreferences: { session: session.fromPartition('...') }` 등) 앱 종료 시 쿠키가 사라지므로 자동 로그인이 불가능하다. 현재 구현은 기본 `defaultSession`(영속)을 사용하므로 문제없다.

---

## 트러블슈팅

### 1. `getSetCookie()` Edge 런타임 미지원

**현상:** `forwardSetCookies`에서 새 AccessToken이 브라우저에 전달되지 않아 자동 로그인 후 즉시 재만료.

**원인:** Vercel Edge Runtime / 일부 Node.js 버전에서 `Headers.getSetCookie()`가 undefined.

**해결:** 런타임에서 메서드 존재 여부를 확인 후 폴백 처리.
```ts
typeof (src as { getSetCookie?: () => string[] }).getSetCookie === "function"
  ? src.getSetCookie()
  : [src.get("set-cookie")].filter(Boolean)
```

---

### 2. `/api/auth/refresh` self-call 재귀 문제

**현상:** middleware에서 `/api/auth/refresh`를 호출하면 무한 루프 또는 "too many redirects" 오류.

**원인:** `matcher`가 `api` 경로를 제외하더라도, 내부적으로 Next.js rewrite를 거치는 과정에서 미들웨어가 재실행되거나 rewrite 자체가 동작하지 않음.

**해결:** `NEXT_PUBLIC_API_URL/auth/refresh`로 백엔드를 직접 호출. Next.js 라우팅 레이어를 완전히 우회.

---

### 3. 백엔드 장애 시 미들웨어 무한 대기

**현상:** 백엔드가 응답하지 않으면 `tryRefreshToken`이 블로킹되어 모든 페이지 요청이 멈춤.

**원인:** `fetch`의 기본 타임아웃 없음.

**해결:** `AbortController`로 3초 타임아웃 설정. 초과 시 `null` 반환 → 보호 페이지면 `/sign-in`으로 즉시 리다이렉트.
```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 3000);
```

---

### 4. 공개 페이지에서 자동 로그인 성공 후 무한 리다이렉트

**현상:** `/sign-in`에서 RefreshToken 갱신 성공 → `/` 리다이렉트 → middleware 재실행 → 반복.

**원인 분석 (발생하지 않는 이유):** 갱신 성공 후 `Set-Cookie`로 새 AccessToken이 부착된 응답이 브라우저로 전달된다. `/`로 리다이렉트된 다음 요청에서는 `isTokenValid()`가 `true`를 반환해 정상 통과한다. 따라서 루프가 발생하지 않는다.

---

### 5. 트레일링 슬래시로 인한 매칭 실패

**현상:** `/sign-in/`으로 접근 시 자동 로그인 후 홈 리다이렉트가 되지 않고 로그인 폼이 표시됨.

**원인:** `AUTH_ONLY_PUBLIC`에 `/sign-in`만 등록되어 있어 `/sign-in/`과 불일치.

**해결:** `pathname = request.nextUrl.pathname.replace(/\/$/, "")` 로 트레일링 슬래시 제거 후 비교.

---

## 수동 테스트 방법

### 웹 브라우저

1. 로그인 후 **DevTools → Application → Cookies** 에서 `AccessToken`만 삭제 (RefreshToken 유지)
2. 새로고침 → 로그인 화면 없이 현재 페이지 유지 확인 ✅
3. `RefreshToken`도 삭제 후 새로고침 → `/sign-in` 리다이렉트 확인 ✅
4. `/sign-in`에 로그인된 상태로 직접 접근 → `/`로 리다이렉트 확인 ✅

### Electron

1. 로그인 후 앱 완전 종료 (Dock에서 종료, Cmd+Q)
2. 앱 재실행 → 로그인 화면 없이 메인 화면 표시 확인 ✅
3. 로그아웃 후 앱 종료 → 재실행 → `/sign-in` 표시 확인 ✅

### 백엔드 장애 시뮬레이션

1. `NEXT_PUBLIC_API_URL`을 존재하지 않는 주소로 임시 변경
2. AccessToken 삭제 후 보호 페이지 접근 → 3초 후 `/sign-in` 리다이렉트 확인 ✅
