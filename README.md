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

- 앱 실행 중 새 버전 감지 시 알림 배너 표시, 원클릭으로 업데이트 적용

## ⚙️ 기술 스택

### 주요 라이브러리 및 프레임워크

- **Electron** `^43.0.0` (데스크탑 앱 런타임)
- **Next.js** `15.3.8`
- **React** `^19.0.0`
- **TypeScript** `^5.8.3`
- **Zustand** `^5.0.3`
- **TanStack React Query** `^5.74.3`
- **Tailwind CSS** `^4.1.4`

### 사용된 패키지

| 분류             | 패키지                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 프레임워크/언어  | `next`, `react`, `react-dom`, `typescript`                                                                               |
| 상태/데이터 페칭 | `zustand`, `@tanstack/react-query`                                                                                       |
| HTTP 통신        | `axios`, `qs`                                                                                                            |
| 스타일링         | `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `autoprefixer`                                                         |
| UI & 인터랙션    | `react-rnd`(창 드래그/리사이즈), `@radix-ui/react-tooltip`, `@uiw/react-color`(컬러 피커), `react-icons`, `use-debounce` |
| 미디어/임베드    | `react-youtube`                                                                                                          |
| 차트             | `recharts`                                                                                                               |
| 알림             | `sonner`                                                                                                                 |
| 데스크탑/배포    | `electron`, `electron-builder`, `electron-updater`                                                                       |

## 🛠️ 개발 환경 설치 및 실행

### 의존성 설치

```bash
npm install
```

### 개발 서버 실행

웹 브라우저에서 확인 (HTTPS):

```bash
npm run dev:https
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

## 📝 프로젝트 구조

```
📂
├─ app
│  ├─ (auth)              # 로그인 필요 페이지 (마이페이지, 통계 등)
│  ├─ download            # 앱 다운로드 페이지
│  ├─ globals.css
│  ├─ layout.tsx
│  ├─ page.tsx
│  └─ providers.tsx
├─ apis                   # API 클라이언트 및 서비스
├─ components             # 공통 UI 컴포넌트
├─ constants              # 공통 상수
├─ hooks                  # 커스텀 훅
├─ src-electron           # Electron 메인/프리로드 스크립트
│  ├─ main.ts
│  └─ preload.ts
├─ stores                 # Zustand 스토어
├─ types                  # TypeScript 타입 정의
├─ utils                  # 유틸리티 함수
├─ scripts                # 빌드 스크립트
├─ buildResources         # 앱 아이콘 등 빌드 리소스
├─ public
├─ next.config.ts
├─ package.json
└─ tsconfig.json
```
