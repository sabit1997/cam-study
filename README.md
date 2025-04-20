# 📹 CAM STUDY

온라인 캠스터디에 최적화된 화면 공유 템플릿 서비스입니다. 하나의 화면에서 웹캠, 여러 개의 창, 투두리스트, 유튜브 임베드 등을 자유롭게 배치하여 효율적인 온라인 스터디 환경을 제공합니다.

[배포 사이트](https://cam-study.vercel.app)

## ✨ 주요 기능

- **다양한 창 타입 지원**: 웹캠, 윈도우 공유, 투두리스트, 유튜브 임베드 등을 하나의 화면에서 동시 활용 가능
- **개인 맞춤 설정 저장**: 회원가입 및 로그인 기능으로 사용자가 설정한 창의 위치, 크기 및 창 유형을 기억하여 자동으로 로드
- **유튜브 임베드 링크 저장**: 자주 시청하는 유튜브 URL을 기억하여 편리하게 반복 시청 가능
- **서버 기반 Todo 관리**: 서버에 저장되어, 창을 삭제하지 않는 한 언제든지 접근 가능한 안정적인 투두리스트 관리

## 🚀 추가 예정 기능

- **타이머 기능**: 효율적인 학습을 위한 타이머 제공
- **마이페이지 학습 시간 관리**: 년도, 월별로 누적 학습 시간을 한눈에 확인할 수 있는 기능 제공 예정

## ⚙️ 기술 스택

### 주요 라이브러리 및 프레임워크

- Next.js 15.3.0
- React 19.0.0
- TypeScript 5
- Zustand
- React Query (@tanstack/react-query)
- Tailwind CSS

### 사용된 패키지

| 분류                 | 사용 패키지                                                       |
| -------------------- | ----------------------------------------------------------------- |
| UI 및 인터랙션       | react-rnd, react-webcam, react-youtube, react-icons, use-debounce |
| 데이터 관리          | axios, localforage, crypto-js, dayjs                              |
| 인증 및 데이터베이스 | @supabase/ssr, @supabase/supabase-js                              |

## 📥 설치 및 실행 방법

### 의존성 설치

```bash
npm install
```

### 개발 서버 실행

```bash
npm run dev
```

### 빌드 및 프로덕션 서버 실행

```bash
npm run build
npm run start
```

## 🧑‍💻 개발 관련 명령어

- **Lint 검사**

```bash
npm run lint
```

## 📝 프로젝트 구조

```
cam-study
├── components      # UI 컴포넌트
├── pages           # 페이지 컴포넌트
├── services        # API 서비스 및 데이터 관리
├── stores          # Zustand를 이용한 상태 관리
├── public          # 정적 리소스
├── types           # TypeScript 타입 정의
└── utils           # 유틸리티 함수
```

## 📚 개발 환경 설정

- ESLint, Vercel 배포

## 📖 문서화

[노션 정리](https://clean-bucket-590.notion.site/NextJS-1d6dcb3f050680769294e16f735c66e1?pvs=4)
