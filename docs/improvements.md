# cam-study 개선점 및 신규 기능 제안

> 코드베이스 분석을 통해 도출한 개선 가능 항목 정리. 우선순위(상/중/하)와 예상 난이도(쉬움/보통/어려움)를 함께 표기.

---

## 1. 신규 기능 제안

### 🔴 상 (즉시 UX 임팩트 큰 것)

| 기능 | 설명 | 난이도 |
|------|------|--------|
| **ToDo 텍스트 편집** | 현재 삭제만 가능. 더블클릭 또는 연필 아이콘으로 인라인 편집 | 쉬움 |
| **Pomodoro 일시정지** | 현재 stop = 세션 기록 손실. 중간에 pause 후 resume 가능하게 | 보통 |
| **긴 휴식(Long Break)** | 4 사이클 완료 시 장기 휴식(15~30분) — 표준 Pomodoro 미구현 | 쉬움 |
| **창 제목 서버 저장** | 현재 localStorage만 → 다른 디바이스·브라우저에서 소실. Window 모델에 `title` 필드 추가 필요 | 보통 |

### 🟡 중 (생산성 향상)

| 기능 | 설명 | 난이도 |
|------|------|--------|
| **레이아웃 저장/불러오기** | 자주 쓰는 창 배치를 프리셋으로 저장. 예: "공부 모드", "영상 시청 모드" | 어려움 |
| **키보드 단축키** | `Cmd+W` 창 닫기, 타이머 시작/정지, 창 전환 등. 현재 전부 마우스 전용 | 보통 |
| **ToDo 드래그 순서 변경** | `dnd-kit` 또는 `react-dnd` 활용. 우선순위 직관적 재배열 | 보통 |
| **개별 창 전체화면** | 특정 창을 화면 전체로 확대. 집중 모드용 | 쉬움 |
| **창 스냅/정렬 가이드** | 드래그 시 다른 창·화면 경계에 자석처럼 달라붙는 기능 | 어려움 |
| **YouTube 검색** | 현재 URL 직접 붙여넣기만 가능. YouTube Data API로 키워드 검색 | 어려움 |
| **오늘 진행 상황 요약 (메인 화면)** | my-page 이동 없이 홈 화면에서 타이머 달성률·ToDo 완료율 미니 위젯으로 확인 | 보통 |

### 🟢 하 (polish / 완성도)

| 기능 | 설명 | 난이도 |
|------|------|--------|
| **카메라 밝기·대비 조절** | CSS `filter` 속성으로 구현 가능. 슬라이더 UI 추가 | 쉬움 |
| **카메라 스냅샷** | 현재 화면 캡처 버튼. Blob 다운로드 또는 클립보드 복사 | 쉬움 |
| **Pomodoro 사운드 커스터마이즈** | 볼륨 조절 슬라이더, 사운드 종류 선택(벨/딩/무음) | 쉬움 |
| **ToDo 우선순위·태그** | 과목별 색상 태그. 기존 API 확장 또는 클라이언트 메타데이터 | 보통 |
| **세션 히스토리 (타이머 창)** | 오늘 완료한 Pomodoro 세션 목록을 타이머 창 내에서 확인 | 보통 |
| **ToDo 삭제 취소(Undo)** | 삭제 후 3초 이내 되돌리기 Toast 버튼 | 쉬움 |
| **창 복제** | 동일 타입의 창을 빠르게 하나 더 추가 | 쉬움 |

---

## 2. 코드 개선점

### 테마 시스템 통일

- **현황**: `--color-primary`, `--color-dark` 등 CSS 변수가 `set-theme-color.ts`에서 정의되지만, 대부분 컴포넌트는 Tailwind 하드코딩 색상 사용 (`bg-lime-400`, `text-green-800` 등)
- **개선**: `tailwind.config.ts`에서 `primary: 'var(--color-primary)'` 형태로 CSS 변수를 Tailwind 컬러로 등록. 컴포넌트는 `bg-primary` 한 줄로 테마 색상 사용
- **효과**: 사용자 테마 색상 변경이 전체 UI에 즉시 반영됨

### 매직 넘버 상수화

- **현황**: `36`(네비게이션 높이), `80`(도크 높이), `500`(debounce ms) 등이 여러 파일에 산재
- **개선**: `constants/layout.ts` 등으로 집중 관리

```ts
// constants/layout.ts 예시
export const NAVBAR_HEIGHT = 36;
export const DOCK_HEIGHT = 80;
export const BOUNDS_DEBOUNCE_MS = 500;
```

### `window.tsx` 컴포넌트 분리

- **현황**: 약 500줄. 드래그/리사이즈 로직, 타이틀바 UI, 컨텐츠 렌더링이 한 파일에 혼재
- **개선 제안**:
  - `WindowTitlebar.tsx` — 제목 편집, 닫기/최소화/잠금 버튼
  - `WindowContent.tsx` — lazy load + Suspense 래핑
  - `window.tsx` — Rnd 바인딩, 뷰포트 클램핑, z-index 관리만 담당

### 아스펙트 비율 로직 중복 제거

- **현황**: `camera-view.tsx`, `window-share.tsx`에 각각 비슷한 비율 감지 로직 존재
- **개선**: `hooks/useAspectRatio.ts` 공통 훅으로 추출

### 에러 핸들링 패턴 통일

- **현황**: 일부 에러는 axios interceptor에서 Toast, 일부는 컴포넌트 `onError` 콜백에서 Toast — 중복 Toast 가능성
- **개선**: API 에러 Toast는 interceptor 한 곳에서만, 컴포넌트는 `onError`에서 상태 처리만 담당

---

## 3. 아키텍처 개선점

### Optimistic Update 확장

- **현황**: 창 bounds(위치/크기)만 낙관적 업데이트, 창 타입 변경은 서버 응답 대기 후 반영
- **개선**: 타입 변경도 로컬 즉시 반영 후 실패 시 롤백. TanStack Query `onMutate` 패턴 활용

### Pomodoro 상태 신뢰성

- **현황**: 사이클 카운터가 mount 시 서버에서 1회만 로드. 이후 인메모리로만 관리 → 새로고침·재접속 시 일부 손실 가능
- **개선**: 각 Pomodoro 세션 완료마다 서버에 즉시 기록 (현재도 `postTime` 호출하지만 사이클 카운트는 별도 관리)

### 창 타입 추가 구조 개선

- **현황**: 새 창 타입 추가 시 `TypeList`, `AddWindow` switch, `WindowDock` DOCK_ITEMS, 각 타입 컴포넌트 등 최소 4곳 수정 필요
- **개선**: 창 타입 설정을 단일 registry 객체로 집중

```ts
// 예시 구조
const WINDOW_REGISTRY = {
  youtube: { component: YouTubePlayer, defaultSize: { w: 580, h: 440 }, icon: ... },
  camera:  { component: CameraView,    defaultSize: { w: 480, h: 320 }, icon: ... },
  // ...
};
```

---

## 4. 알려진 UX 이슈

| 이슈 | 위치 | 해결 방향 |
|------|------|-----------|
| ToDo 텍스트 넘침 시 말줄임표만, 툴팁 없음 | `todos.tsx` | `title` 속성 또는 Radix Tooltip 추가 |
| Pomodoro 실행 중 설정 변경 불가 | `timer.tsx` | 타이머 중지 없이 다음 세션부터 적용되는 "예약 변경" 방식 |
| 카메라 디바이스 변경 시 검은 화면 깜빡임 | `camera-view.tsx` | 새 스트림 준비 후 교체 (picture-in-picture 방식) |
| YouTube 임베드 불가 콘텐츠를 추가 후에야 오류 확인 | `youtube-player.tsx` | URL 입력 즉시 `/api/check-youtube` 호출로 사전 검증 |
| 창 최소화 시 컨텐츠 상태 리셋 가능성 | `window.tsx` | 최소화를 CSS `height: 38px` + `overflow: hidden`으로 처리하면 상태 보존 |
| 세션 만료 후 화면 이동 없이 PATCH 실패 반복 | `apis/request.ts` | refresh 최종 실패 시 `/sign-in` 리다이렉트 명시적 처리 확인 |

---

## 5. 테스트 커버리지 확대 제안

현재 유닛 테스트: `extractYouTubeId`, `formatSeconds`, `pomodoroLogic` 정도.

추가하면 좋을 테스트:

- `stores/window-state.tsx` — `mergeWindows` 병합 전략, `bringToFront` z-index 정규화
- `apis/request.ts` — 401 큐잉 로직, 동시 refresh 방지
- `middleware.ts` — JWT exp 검증, 리다이렉트 경로
- `utils/shareService.ts` — 스트림 캐시 set/get/clear
