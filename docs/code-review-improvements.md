# 코드 리뷰 개선 사항

> 마이그레이션(Next.js → Vite) 이후 전체 코드 리뷰 결과 정리.

---

## 🔴 Critical

### 1. `setGlobalQueryClient` 미호출 → React Query 캐시 미청소 ✅
- **파일**: `apis/request.ts`, `src/App.tsx`
- **문제**: `globalQueryClient`가 항상 `null`이라 로그아웃 시 캐시가 청소되지 않음
- **수정**: `src/App.tsx`에서 `setGlobalQueryClient(queryClient)` 호출 추가

### 2. Vercel 프록시 Set-Cookie 다중 헤더 손실 ✅
- **파일**: `api/[...path].ts`
- **문제**: `Headers.get("set-cookie")`는 다중 헤더 중 첫 번째만 반환. AccessToken + RefreshToken 동시 세팅 시 하나 소실
- **수정**: `upstream.headers.getSetCookie()` (배열 반환) 사용

### 3. ErrorBoundary가 async 에러를 못 잡음 ✅
- **파일**: `components/error-boundary.tsx`
- **문제**: React ErrorBoundary는 렌더 phase sync 에러만 캐치. axios 401 에러는 인터셉터에서 처리되므로 `error.includes("401")` 로직이 실질적으로 무의미
- **수정**: 401 처리 로직 제거, 단순 에러 표시 UI로 정리

---

## 🟡 Warning

### 4. `"use client"` 잔재 23개 파일 ✅
- **파일**: `components/`, `stores/window-state.tsx` 등
- **문제**: Vite에서 no-op이지만 코드 오염
- **수정**: 일괄 제거

### 5. 403 토스트가 axios 인터셉터 전역에 있음
- **파일**: `apis/request.ts:112`
- **문제**: 백그라운드 refetch 등에서도 예상치 못한 토스트 발생 가능
- **판단**: 현재 사용 패턴 확인 후 제거 여부 결정. 우선 유지.

### 6. `preload.ts` 광범위한 `any` 타입 ✅
- **파일**: `src-electron/preload.ts`
- **문제**: IPC 신뢰 경계에서 `any` 사용
- **수정**: `globals.d.ts`의 `electronAPI` 인터페이스와 일치하는 구체적 타입으로 변경

### 7. `bringToFront` zIndex 임계값 상수화 ✅
- **파일**: `stores/window-state.tsx:56`
- **문제**: `windows.length * 2`라는 매직 넘버
- **수정**: 상수로 추출 + 주석

### 8. Vercel 프록시 헤더 포워딩 선택적 ✅
- **파일**: `api/[...path].ts`
- **문제**: Cookie/Content-Type/X-User-Timezone만 포워딩. 기능 추가 시 누락 발생 가능
- **수정**: hop-by-hop 헤더만 제외하고 나머지 전체 포워딩

### 9. `mergeWindows` 낙관적 삭제 시 창 부활 가능성
- **파일**: `stores/window-state.tsx`
- **판단**: 서버 API가 삭제 후 즉시 응답하므로 실제 문제는 드묾. API 레이어 확인으로 대체.

---

## 🔵 Info

### 10. 프로덕션 `console.log` 업데이트 진단 로그 ✅
- **파일**: `src-electron/main.ts:125-145`
- **수정**: 불필요한 진단 로그 정리 (autoUpdater.logger는 유지)

### 11. 번들 크기 856KB → 코드 스플리팅 ✅
- **파일**: `src/App.tsx`
- **수정**: 페이지 컴포넌트를 `React.lazy`로 전환

### 12. `react-hooks/exhaustive-deps` eslint-disable 이유 주석 ✅
- **파일**: 4곳
- **수정**: 왜 disable이 안전한지 주석 추가

### 13. `afterPackMac.js` Electron 버전 의존 offset 경고
- **파일**: `scripts/afterPackMac.js`, `package.json`
- **내용**: `0x13adbf8` offset은 electron 43.0.0 전용. 업그레이드 시 재계산 필요 명시

---

## 진행 현황

| # | 항목 | 상태 |
|---|------|------|
| 1 | setGlobalQueryClient 미호출 | ✅ 완료 |
| 2 | Vercel Set-Cookie 다중 헤더 | ✅ 완료 |
| 3 | ErrorBoundary 단순화 | ✅ 완료 |
| 4 | "use client" 제거 | ✅ 완료 |
| 5 | 403 토스트 인터셉터 | 유지 결정 |
| 6 | preload.ts any 타입 | ✅ 완료 |
| 7 | bringToFront 상수화 | ✅ 완료 |
| 8 | Vercel 헤더 전체 포워딩 | ✅ 완료 |
| 9 | mergeWindows 창 부활 | 유지 결정 |
| 10 | 프로덕션 console.log | ✅ 완료 |
| 11 | 번들 코드 스플리팅 | ✅ 완료 |
| 12 | eslint-disable 주석 | ✅ 완료 |
| 13 | afterPackMac offset 경고 | 주석 추가 |
