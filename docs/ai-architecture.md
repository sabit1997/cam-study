# AI 파이프라인 아키텍처

CamStudy에서 자연어 명령, 유튜브 검색, 기록 질의가 실제로 어떤 층을 지나는지 정리합니다.
이 문서는 브랜치 리뷰에 서사가 되는 지점이라 짧고 촘촘하게 씁니다.

## 액션은 데이터다

CamStudy의 AI는 함수를 호출하지 않고 **액션 JSON을 반환합니다.** 실행은 앱 코드가 담당합니다.

```
사용자 문장
    │
    ▼
[server/ai-interpret.ts]  ← Gemini에게 시스템 프롬프트 + JSON 스키마를 태워 호출
    │                        (모델은 이 스키마 밖의 응답을 만들지 못한다)
    │
    ▼
스키마 파싱 (types/ai-actions.ts)  ← 1단계 검증: 모양만 확인
    │
    ▼
클라이언트로 반환 (배치 = AiAction[])
    │
    ▼
utils/ai-action-validate.ts  ← 2단계 검증: 값이 말이 되는가
    │    - 개수 한도(창·할일)
    │    - ref 무결성 (같은 배치의 CREATE_WINDOW만 가리킬 수 있음)
    │    - 날짜 범위·미래 금지 등 값 규칙
    │
    ▼
utils/ai-action-plan.ts  ← 액션 → PlannedStep 배열로 번역
    │
    ▼
components/ai/ai-action-runner.tsx  ← 유일한 실행 지점
     - createWindow / addTodo → 서버 API 호출
     - queryTotal 등 → utils/ai-record-query 호출 → answer 마크다운으로
```

## 어댑터 3종 (프레임워크 무관)

`server/ai-interpret.ts`(로직)와 세 어댑터가 분리돼 있습니다. 어느 환경이든 얇은 어댑터만 얹고 로직은 하나입니다.

| 어댑터                          | 위치                             | 실제 하는 일                                                                  |
| ------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| **Vite 개발 미들웨어**          | `vite.config.mts`                | 로컬 개발 시 `/api/ai-interpret` 요청을 `interpret()`로 태운다                |
| **Vercel 서버리스 함수**        | `api/ai-interpret.ts`            | 웹 배포. Origin·세션 쿠키·IP 레이트리밋 등 접근 통제                          |
| **Electron Express 프록시**     | `src-electron/express-server.ts` | 데스크탑에서 웹 배포본으로 프록시 (API 키를 바이너리에 박지 않는 이유)        |

세 어댑터는 서로를 몰라도 됩니다. `interpret()` 한 함수 시그니처만 지켜지면 어댑터는 얼마든 늘어날 수 있습니다.

## 두 공급자 어댑터 서사 (스키마 계층)

이전 설명: "Anthropic이 zod 출력을 거부해서 변환 계층을 뒀다." — 한 공급자의 사정처럼 들렸습니다.
현재 설명: **"같은 zod 스키마를 두 공급자에 태웠고, 각각 거부하는 키워드가 달랐다. 그래서 캐노니컬 스키마 하나 + 공급자별 어댑터로 분리했다."**

```
types/ai-actions.ts  ← Zod로 정의된 캐노니컬 스키마 (진실의 근원)
   │
   ├── server/gemini-schema.ts  ← Zod → Gemini responseJsonSchema
   │                              (const → enum 변환, pattern 제거)
   │
   └── (미래) server/anthropic-schema.ts  ← 다른 공급자를 붙일 때 여기만 추가
```

## purpose로 분기하는 thinking level (설계 문서 §2.7)

`server/ai-interpret.ts`의 `Purpose`가 다섯 값입니다.

| Purpose         | thinkingLevel | 이유                                                     |
| --------------- | ------------- | -------------------------------------------------------- |
| command         | MINIMAL       | 짧은 구조 변환. 지연이 곧 체감 품질                      |
| record-query    | MINIMAL       | 함수 이름 하나 뽑는 정도                                 |
| label-suggest   | MINIMAL       | 앱 이름 분류                                             |
| youtube-search  | MEDIUM        | 그라운딩 → 필터링 → JSON 정리 다단계. MINIMAL은 조기 종료 위험 |
| video-analyze   | MEDIUM        | 영상 파싱 · 목차 추출                                    |

## quota 방어층 (무료 티어)

무료 티어를 쓰기 때문에 서버 429가 UI로 새어나오기 전에 클라이언트가 선제로 막습니다.

```
사용자 명령
    │
    ▼
utils/ai-quota.ts (localStorage aiQuota, 자정 리셋)
    │  - purpose별 가중치 (command:1, youtube-search:2, video-analyze:3)
    │  - 세션 예산 20 소진 시 → 팔레트가 "몫 다 씀" 안내
    │
    ▼ (통과)
서버 요청 → 서버 IP 레이트리밋 (분당 10건)
    │
    ▼ (429일 때)
utils/ai-fallback.ts  ← 예시 다섯 개는 사전 녹화 응답으로 살려낸다
                        ("오프라인 데모 응답" 배지로 표시)
```

## 유튜브 파이프라인 (설계 문서 §2.6)

```
사용자: "강의 3개 찾아서 담아줘"
    │
    ▼
팔레트 정규식 라우팅 → server/youtube-search
    │  - Gemini `tools: [{ googleSearch: {} }]`
    │  - LLM이 URL을 지어내지 못한다 (실제 검색 결과에서 뽑음)
    │
    ▼
utils/youtube-pipeline.ts
    │  - 후보마다 /api/check-youtube 호출 (임베드 가능 여부 검사)
    │  - 통과분만 승인 패널에 전달  ← 승인 전에 검사, 승인 후에 사라짐 방지
    │
    ▼
components/ai/youtube-approval-panel.tsx
    │  - 사용자가 체크 → toPlayActions()로 PLAY_YOUTUBE 배열 조립
    │
    ▼
runAiActions  ← 일반 명령과 완전히 같은 실행 경로
```

## 딴짓 감지 파이프라인 (설계 문서 §2.1~§2.2)

Electron 메인 프로세스에 얹혔습니다. 렌더러가 꺼져도 폴링·기록이 계속 돌아요.

```
components/timer.tsx (스톱워치 시작)
    │
    ▼ IPC: tracker:start
    │
src-electron/tracker/
    │
    ├── poller.ts        (5초마다 get-windows 호출, 앱 이름만 얻음)
    │   │
    │   ▼
    ├── label-resolver.ts (앱 이름 → study/distract/neutral)
    │   │
    │   ▼
    ├── state-machine.ts (순수함수 4상태 머신)
    │   │
    │   ▼
    ├── session-store.ts (진행 세션 인메모리 + 완료 세션 electron-store)
    │
    └── power-guard.ts   (suspend/lock 이벤트 → 시계 얼림)

세션 종료 시 IPC tracker:stop → SessionSummary 반환
    │
    ▼
components/tracking/session-summary-modal.tsx
    │  [제외] → utils/session-correction으로 focus 청크만 postTime
    │  [그대로] → 원본 startedAt~endedAt 한 번
```

## 이 아키텍처가 지키는 것

1. **실행 지점 단일화**: 모든 액션은 `runAiActions` 하나를 지납니다. 승인·검증·감사 로그를 여기 하나에만 붙이면 됩니다.
2. **입력원 무관성**: AI가 만든 명령이든, 개발 콘솔에서 넣은 액션이든, 향후 딴짓 감지가 만들 자동 액션이든 같은 문을 지납니다.
3. **공급자 무관성**: Gemini를 Anthropic으로 바꿔도 어댑터 하나만 추가하면 됩니다. 액션 정의·검증·계획·실행기는 어느 회사 모델인지 모릅니다.
4. **권한 최소화**: 감지 정확도를 조금 낮추더라도, macOS 화면 기록·손쉬운 사용 권한을 애초에 받지 않는 구조를 선택했습니다.
