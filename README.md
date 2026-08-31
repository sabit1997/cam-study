# 📹 외요의 캠스터디

온라인 캠스터디에 최적화된 **데스크탑 앱**입니다. 하나의 화면에서 웹캠, 여러 개의 창, 투두리스트, 유튜브 임베드 등을 자유롭게 배치하여 효율적인 온라인 스터디 환경을 제공합니다.

[배포 사이트](https://cam-study.vercel.app) · [다운로드 페이지](https://cam-study.vercel.app/download) · [GitHub Releases](https://github.com/sabit1997/cam-study/releases/latest)

테스트 아이디
| 아이디 | 비밀번호 |
|---|---|
| test1@test.com | Ab1234@@ |
| test2@test.com | Ab1234@@ |

## 📥 다운로드

| 플랫폼  | 파일                                                                                                   | 아키텍처              |
| ------- | ------------------------------------------------------------------------------------------------------ | --------------------- |
| macOS   | [CamStudySetup.dmg](https://github.com/sabit1997/cam-study/releases/latest/download/CamStudySetup.dmg) | Apple Silicon (arm64) |
| Windows | [CamStudySetup.exe](https://github.com/sabit1997/cam-study/releases/latest/download/CamStudySetup.exe) | x64 (64비트)          |

앱 실행 후 새 버전이 출시되면 자동으로 업데이트 알림이 표시됩니다.

## ✨ 주요 기능

### 🧩 멀티 윈도우 워크스페이스

- **동시 활용:** 웹캠, 윈도우 공유, Todo 리스트, YouTube 임베드를 **한 화면에 동시에** 배치/리사이즈
- **드래그 & 리사이즈:** 자유로운 레이아웃 구성

### 👤 개인 맞춤 설정 저장

- **저장 항목:** 각 창의 **위치, 크기, 유형**을 사용자 계정에 연동하여 **자동 복원**
- **로그인 기반 동기화:** 회원가입/로그인 시 어디서든 동일한 작업 환경 재현 (테마 색상 제외)

### ▶️ YouTube 임베드 재생목록

- **URL 검증:** 임베드 **가능한 링크만** 선별하여 재생목록 구성
- **서버 저장 & 반복 재생:** 등록한 YouTube URL 리스트를 서버에 저장하고 순환 재생

### ✅ 서버 기반 Todo 관리

- **영속성:** 삭제하지 않는 한 **항상 접근 가능**한 서버 저장 Todo

### ⏱️ 서버 기반 타이머 & 기록

- **공부 시간 기록:** 타이머로 측정한 **일별 집중 시간**을 서버에 저장
- **목표 시간 설정:** 하루 목표 시간을 정하고 달성률을 타이머/마이페이지에서 확인

### 📊 마이페이지 통계

- **일별 기록 열람:** 날짜별 집중 시간 흐름 확인
- **달성률 & 비교:** 목표 대비 달성률, **지난 달과의 비교** 제공
- **패턴 인사이트:** **가장 집중한 날**, **요일별 집중 시간**으로 루틴 최적화

### 🎨 테마 & 색상 팔레트 (로컬 저장)

- **팔레트 기반 편집:** 기본 배경 / 강조 / 텍스트 / 텍스트 선택 색상을 컬러 피커로 즉시 변경
- **실시간 미리보기:** 변경 사항이 화면에 바로 반영
- **로컬 보존:** 브라우저 **로컬 저장소**에 자동 저장되어 다음 접속 시 그대로 복원 (로그인 불필요)
- **초기화 지원:** 한 번에 기본 테마로 **원클릭 초기화**

### 🔄 자동 업데이트

- 앱 실행 중 새 버전 감지 시 알림 배너 표시. Windows는 원클릭 적용, macOS는 안전한 수동 설치 페이지로 연결

## 🔒 프라이버시

CamStudy는 공부 화면을 자주 방송(디스코드 등)하는 사용 맥락에서 설계됐습니다. 그래서 **무엇을 밖으로 보내는지보다 무엇을 애초에 받지 않는지**를 더 중요하게 다룹니다.

### 데이터 흐름 표

| 데이터                              | 로컬만        | 자사 서버         | Google (Gemini)                  |
| ----------------------------------- | ------------- | ----------------- | -------------------------------- |
| 활성 앱 이름 (딴짓 감지 입력원)     | 데스크탑만    | ❌                | 프리셋에 없는 앱을 만났을 때만   |
| 화면 스크린샷·픽셀                  | ❌            | ❌                | ❌                               |
| 창 제목 (대화 상대·문서명·브랜치명) | ❌            | ❌                | ❌ **권한 자체를 받지 않습니다** |
| 카톡·디스코드 대화 내용             | ❌            | ❌                | ❌                               |
| 웹캠 영상                           | 로컬 프리뷰만 | ❌                | ❌                               |
| 자연어 명령                         | ❌            | 프록시 통과       | ✅ (해석 목적으로만)             |
| 유튜브 URL                          | ❌            | 재생목록에만 저장 | 사용자가 분석을 요청한 영상만    |
| 학습 시간 통계                      | ❌            | ✅ (보정값)       | ❌                               |

### 격상된 주장

이전 문구: "창 제목을 읽지만 밖으로는 라벨만 보냅니다." — **약속**
현재 구조: **"창 제목을 읽을 권한을 애초에 받지 않았습니다."** — **구조**

`get-windows`(옛 `active-win`)에 `accessibilityPermission: false`·`screenRecordingPermission: false`로 호출하면 macOS의 화면 기록·손쉬운 사용 권한 프롬프트가 아예 뜨지 않습니다. 시스템 설정 → 개인정보 보호에서 CamStudy가 목록에 등장하지 않는 것으로 검증할 수 있어요.

### 무료 티어 Gemini 이슈

Gemini API 무료 티어의 추가 약관은 제출 콘텐츠와 응답을 Google의 제품·ML 개선에 사용할 수 있고 사람이 검토할 수도 있다고 명시합니다. 유료 티어는 해당 목적으로 사용되지 않아요.

CamStudy가 Gemini에 실제로 보내는 것은 위 표의 마지막 세 항목뿐입니다. 민감 항목(대화 내용·창 제목·화면 픽셀)은 애초에 보내지 않으므로 **무료 티어를 쓰기 때문에 오히려 "무엇을 안 보내는지"가 더 중요해졌습니다.**

### 딴짓 감지 파이프라인 (설계 문서 §2.1)

- **입력원:** 포그라운드 앱 이름만 (예: `KakaoTalk`, `Discord`). 창 제목은 읽지 않습니다.
- **판정:** 앱 분류가 아니라 **연속 체류 시간**입니다. 카톡 30초는 정상(답장 하나), 카톡 15분은 딴짓.
- **알림:** 없습니다. 세션이 끝날 때 한 번만 요약을 보여드려요.
- **자동 정지:** 없습니다. 오탐 시 실제 공부 시간이 사라지는 피해가 크기 때문에 사후 보정으로 결정을 사용자에게 남깁니다.

자세한 아키텍처는 [`docs/ai-architecture.md`](docs/ai-architecture.md)를 참고하세요.

## ⚙️ 기술 스택

### 주요 라이브러리 및 프레임워크

- **Electron** `^43.0.0` (데스크탑 앱 런타임)
- **Vite** `^8.2.0`
- **React** `^19.0.0`
- **TypeScript** `^5.8.3`
- **Zustand** `^5.0.3`
- **TanStack React Query** `^5.74.3`
- **Tailwind CSS** `^4.1.4`

### 사용된 패키지

| 분류             | 패키지                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 프레임워크/언어  | `vite`, `react`, `react-dom`, `typescript`                                                                               |
| 상태/데이터 페칭 | `zustand`, `@tanstack/react-query`                                                                                       |
| HTTP 통신        | `axios`, `qs`                                                                                                            |
| 스타일링         | `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `autoprefixer`                                                         |
| UI & 인터랙션    | `react-rnd`(창 드래그/리사이즈), `@radix-ui/react-tooltip`, `@uiw/react-color`(컬러 피커), `react-icons`, `use-debounce` |
| 미디어/임베드    | `react-youtube`                                                                                                          |
| 차트             | `recharts`                                                                                                               |
| 알림             | `sonner`                                                                                                                 |
| 데스크탑/배포    | `electron`, `electron-builder`, `electron-updater`                                                                       |

## 🛠️ 개발 환경 설치 및 실행

### 요구 환경

- Node.js **20.19+** 또는 **22.12+** (`vite`, `electron-builder`가 요구)
- macOS 실기(데스크탑 빌드/실측용)

### 의존성 설치

```bash
npm install
```

### 개발 서버 실행

웹 브라우저에서 확인:

```bash
npm run dev:web
```

Electron 앱으로 실행:

```bash
npm run dev
```

### 데스크탑 앱 빌드

```bash
npm run build:app
```

빌드 결과물은 `dist/` 폴더에 생성됩니다.

### 로컬 전용 모드 빌드 (서버·AI 없이 개인용)

백엔드 서버 없이 로그인·회원가입 절차를 건너뛰고 데이터를 이 기기에만 저장하는 모드입니다. AI/온보딩·유튜브 검색 등 Gemini에 의존하는 기능은 UI에서 숨겨집니다.

```bash
# 웹 (Vercel/정적 호스팅)
VITE_APP_MODE=local npm run build:web

# 데스크탑 (Electron)
VITE_APP_MODE=local npm run build:app
```

**모드 별 차이**

| 항목 | server (기본) | local |
| --- | --- | --- |
| 로그인/회원가입 | 필요 | 스킵 (익명 단일 유저) |
| 창·투두·타이머 | api.oeyo-cam.site | 이 기기 저장소 |
| AI 명령/온보딩/유튜브 검색 | 사용 가능 | UI 은닉 |
| Cmd+Shift+K 전역 팔레트 | 활성 | 비활성 |
| 자동 업데이트 | GitHub Releases | GitHub Releases (동일) |

**로컬 데이터 위치**

- 데스크탑: `electron-store`가 관리하는 유저 데이터 디렉터리 (`~/Library/Application Support/외요의 캠스터디/app-data.json` 등)
- 웹: 브라우저 `localStorage`

`server` 모드로 쌓인 데이터와 `local` 모드 데이터는 완전히 분리됩니다 (마이그레이션 없음).

### 배포 설정

이 리포는 현재 **로컬 모드**로 배포되도록 세팅돼 있습니다.

**Vercel (다운로드 페이지 + 로컬 웹앱)** — 프로젝트 Environment Variables:

| 변수 | 값 | 필수? |
| --- | --- | --- |
| `VITE_APP_MODE` | `local` | 필수 |
| `YOUTUBE_API_KEY` | (본인 키) | 선택 — 유튜브 창 영상 제목이 예쁘게 뽑히려면 |

로컬 모드에서는 Gemini/백엔드 프록시가 필요 없어 `GEMINI_API_KEY` 등은 지정 안 해도 됩니다. 서버 모드로 되돌리려면 `VITE_APP_MODE`를 지우고 `GEMINI_API_KEY`·`YOUTUBE_API_KEY`를 넣습니다.

**GitHub Actions (`.github/workflows/release.yml`)** — 데스크탑 인스톨러 릴리즈. `v*.*.*` 태그 push 시 macOS(arm64) + Windows(x64) 로컬 모드 빌드를 GitHub Releases에 첨부합니다. 서버 모드로 되돌리려면 두 잡의 `env: VITE_APP_MODE: local`을 지우고 `AI_PROXY_URL`을 다시 걸어야 합니다.

Vercel 자동 배포와 GitHub Actions 릴리즈는 서로 독립입니다 — Vercel은 main 브랜치 push에, 릴리즈 워크플로우는 태그 push에 트리거됩니다.

### 성능 측정 (자동 파이프라인)

번들 크기와 Electron 앱 크기의 회귀를 사람 손 없이 잰다. 원인·계획 문서는 `docs/lightening-*.md` 참고.

**웹 번들 (dist/*.js, 초기 로딩 네트워크/콘솔/coverage)**

```bash
npm run perf:bundle:before      # 변경 전 스냅샷
npm run perf:bundle:after       # 변경 후 스냅샷
npm run perf:bundle:diff        # 회귀 리포트 (임계값 +5% 초과 시 exit 1)
```

**Electron 앱 (.app 총합, asar/unpacked/Frameworks/로케일 breakdown)**

```bash
npm run perf:electron:before
npm run perf:electron:after
npm run perf:electron:diff
```

결과: `perf-out/bundle/`, `perf-out/electron/` 아래 `summary.md`, `diff.md`, 원시 JSON.

## 📝 프로젝트 구조

```
📂
├─ apis                   # API 클라이언트 및 서비스
├─ components             # 공통 UI 컴포넌트
├─ constants              # 공통 상수
├─ hooks                  # 커스텀 훅
├─ pages                  # React Router 페이지
├─ src                    # 앱 진입점, 라우터, 전역 스타일
├─ src-electron           # Electron 메인/프리로드 스크립트
│  ├─ main.ts
│  └─ preload.ts
├─ stores                 # Zustand 스토어
├─ types                  # TypeScript 타입 정의
├─ utils                  # 유틸리티 함수
├─ scripts                # 빌드 스크립트
├─ buildResources         # 앱 아이콘 등 빌드 리소스
├─ public
├─ vite.config.mts
├─ package.json
└─ tsconfig.json
```
