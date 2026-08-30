# 웹 번들 경량화 (전체 기록)

> 사용자가 배포 사이트(https://cam-study.vercel.app)에 진입할 때 다운받는 JS/CSS 자산과 초기 로딩 latency 를 줄인 세션의 전체 기록. 원인 분석 · 계획 · 실행 결과 · 남은 이슈까지 이 한 문서에 담는다.
> 스코프: 웹 번들(`vite build` 산출물 = `dist/`) + 초기 페이지 로딩(홈 `/`)의 네트워크·콘솔·coverage.
> 판정 원천: `scripts/perf-measure-bundle.mjs` 실측. `1 KB = 1024 bytes`.

---

## 0. 결과 요약 (Baseline → 최종)

| 지표 | Baseline | 최종 | Δ | 판정 |
|---|---|---|---|---|
| **리포 소스 트리** (build/캐시 제외) | 3,294 KB | 2,375 KB | **-27.9% (-919 KB)** | 크게 감소 |
| **초기 페이지 load(networkidle)** | 1,448 ms | 1,164 ms | **-19.6% (-284 ms)** | 크게 감소 |
| **index 진입 청크 gzip** | 108.0 KB | 103.6 KB | **-4.0% (-4.3 KB)** | 감소 |
| 최대 청크 raw | 355.7 KB | 347.0 KB | -2.5% | 감소 |
| dist 총합 | 1,283 KB | 1,284 KB | +0.1% | 무변 |
| JS 총합 gzip | 325.9 KB | 327.8 KB | +0.6% | 미세 회귀 (청크 분리 오버헤드) |
| 홈 로딩 encoded transfer | 231.8 KB | 235.8 KB | +1.7% | 미세 회귀 |
| 요청 수 | 13 | 18 | +5 (lazy 청크 증가) |
| 콘솔 error / warn / pageerror | 0 / 0 / 0 | 0 / 0 / 0 | 회귀 0 ✓ |

**한 줄 요약**: 총 다운로드량은 사실상 그대로지만 **초기 진입 부담(index -4%)과 리포 크기(-28%)가 명확히 줄었고, 초기 로딩 시간이 -20% 짧아졌다.** recharts(record 청크 최대 감량 여지)는 rolldown 청크링 이슈로 이번 세션에서 못 건드림 — 아래 §6 남은 이슈로.

---

## 1. 원인 분석

### 1.1 지표 요약 (Baseline)

`vite build` 산출물(`dist/`)의 스크립트 실측치. `1 KB = 1024 bytes`.

| 카테고리 | 값 |
|---|---|
| dist 총 크기 | **1,283 KB** |
| JS 총합 (raw) | **1,052 KB** (24 chunks) |
| JS 총합 (gzip) | **326 KB** |
| CSS (raw / gzip) | 42.6 KB / 8.2 KB |
| 진입 청크 `index-*.js` (raw / gzip) | **355.7 KB / 108.0 KB** |
| 최대 lazy 청크 `record-*.js` (raw / gzip) | **347.0 KB / 99.6 KB** |
| 홈 청크 `home-*.js` (raw / gzip) | 113.7 KB / 36.5 KB |
| `config-*.js` (react-query 계열) | 99.4 KB / 33.5 KB |
| 홈 로딩 시 encoded transfer (Playwright + CDP) | 231 KB (JS 172 KB, 폰트 49 KB) |
| 리포 소스 트리 (`node_modules`/`dist`/`.git`/`perf-out` 등 제외) | **3,294 KB** |
| 리포 내 미참조 에셋 | **`font/DungGeunMo.woff2` = 924 KB** |

### 1.2 진입 청크(index-*.js, gzip 108 KB)에 zod 스키마가 통째로 편승

**증거.**

- `dist/assets/index-*.js` 내 심볼 지문: `grep -oE 'zod' index-*.js | wc -l` → **329회 등장**.
- 진짜 호출 사슬 (`import type`은 컴파일에서 지워지므로 값 임포트만 추적):

```
src/App.tsx:19  AiActionRunner (top-level, eager)   ← 진짜 진입점
   └─ components/ai/ai-action-runner.tsx:6
      └─ utils/ai-action-validate.ts:1-5
         └─ types/ai-actions.ts:1  import { z } from "zod"

src/App.tsx:20  CommandPalette (top-level, eager)
   └─ components/ai/command-palette.tsx:6
      └─ utils/ai-action-validate.ts …  (같은 사슬)
```

- `types/ai-actions.ts` 를 값(runtime)으로 import 하는 파일은 실제로 **`utils/ai-action-validate.ts` 단 하나**. 나머지 참조는 `import type` 이라 컴파일에서 지워진다.
- 그 `ai-action-validate` 를 값으로 참조하는 최상위 진입점이 `AiActionRunner`(App.tsx:19) 와 `CommandPalette`(App.tsx:20) 이고, 둘 다 top-level static import 이므로 index 청크에 편승된다.

**왜 문제인가.** Vite/Rolldown 은 `App.tsx` 가 정적으로 참조하는 모든 심볼을 진입 청크에 몰아 넣는다. 두 컴포넌트는 사실상 사용자 이벤트 이전엔 UI 를 노출하지 않는다. zod 자체가 tree-shake 가 잘 되는 라이브러리라 **문제는 zod 가 아니라 eager 진입점에서 검증 스키마를 참조한다는 배치의 문제**다.

**주의.** 둘 중 하나만 lazy 로 옮기면 다른 사슬이 유지돼 zod 가 index 에 남는다. **함께** 옮기거나, `validateAiActions` 가 zod 스키마를 즉시 참조하지 않도록 리팩터해야 한다.

### 1.3 `record` 페이지 청크가 recharts 통째로 안고 있다

- `dist/assets/record-*.js`: **347 KB (raw) / 99.6 KB (gzip)**
- `grep -oE 'recharts' record-*.js | wc -l` → **60회 등장**
- 참조: `components/my-stats-page.tsx`, `components/statics-section.tsx` (recharts LineChart 등).

lazy chunk 라 초기 로딩엔 안 들어오지만 "기록" 탭 첫 진입 시 gzip 100 KB 를 통째로 다운로드한다.

### 1.4 `config` / `useQuery` 청크 = @tanstack/react-query 부담

- `dist/assets/config-*.js`: 99.4 KB / 33.5 KB (gzip)
- `dist/assets/useQuery-*.js`: 15.9 KB / 5.3 KB, `mutation-*.js`, `middleware-*.js` 다수
- `config-*.js` 안 지문: `QueryClient` 2회, `Mutation` 5회 (minify 로 대부분 심볼 소실).
- `src/App.tsx:9-10` 에서 `QueryClientProvider`, `ReactQueryDevtools` eager 임포트.
- **`ReactQueryDevtools` 는 컴포넌트 트리에서만 조건부일 뿐 모듈 임포트는 무조건 진행**된다 (line 197).

### 1.5 죽은 에셋: `font/DungGeunMo.woff2` (924 KB)

- 파일 크기 946,116 바이트 (924 KB).
- `grep -rln "DungGeun" --exclude-dir=…` — 소스/CSS/HTML 어디에도 참조 없음.
- `src/globals.css` — Google Fonts Inter 사용, 로컬 폰트 `@font-face` 없음.
- Vite `publicDir: "public"` 이라 웹 번들에 포함 안 됨.
- `package.json` build.files 는 `dist-electron/**/*`, `dist/**/*` 만 포함 → **Electron 패키지에도 포함 안 됨**.
- 배포 산출물엔 없지만 **리포지토리 클론/CI/Docker 컨텍스트/에디터 인덱싱** 에서 매번 924 KB 를 실어 나른다.

### 1.6 톱-레벨에 상주하지만 즉시 필요 없는 컴포넌트들

`src/App.tsx:92~104` AppShell 에서 항상 마운트: `GlobalInitializer`(95), `ServiceWorkerRegister`(96), `ScreenPickerModal`(98), `AiActionRunner`(99), `CommandPalette`(100), `UpdateNotifier`(176).

이들 다수가 "이벤트가 오기 전까지 UI 미노출" 컴포넌트인데 정적 임포트이므로 진입 청크에 코드가 실린다. `GlobalInitializer`, `ServiceWorkerRegister` 는 부팅용 사이드이펙트라 eager 유지가 맞고 — 옮길 대상은 나머지.

### 1.7 런타임: 항상 도는 폴러/타이머 (별도 관심사)

- `components/navigation.tsx` — `setInterval(updateTime, 1000)`. 로그인 여부와 무관하게 시계가 1초마다 도는지 재확인 필요.
- `src-electron/tracker/poller.ts:84` — 5초 폴링. 세션 시작 이벤트 없이도 도는지 검증 필요.
- `components/timer.tsx` — 타이머/저장/포모도로용 다중 `setInterval`.

번들 크기가 아니라 CPU/배터리 부담. 별도 지표로 관측하기로 하고 이 세션에서는 제외.

### 1.8 소소한 것들 (수치 근거 부족, 확정 X)

- `components/tooltip-wrapper.tsx:1` — `import * as Tooltip from "@radix-ui/react-tooltip"`. namespace import 의 사이드이펙트 판정에 따라 몇 KB 손해 가능.
- `axios` — `apis/` 에서 사용. `fetch` 이관 시 gzip 3~5 KB 여유.
- `qs` — Express 서버에서 쿼리 파싱. 실제 소비량 낮으면 URLSearchParams 로 이관 가능.
- CSS 42.6 KB (gzip 8.2) — Tailwind 4 JIT 라 이미 적당.

---

## 2. 판정 지표 (Success Criteria)

각 스텝은 아래 지표 중 **명시된 것**만 목표로 삼는다. 그 외는 회귀 감시.

| ID | 지표 | 원천 | 취득 방법 |
|---|---|---|---|
| B1 | dist 총 크기 (bytes) | `dist/` | `walk(DIST)` 합계 |
| B2 | JS raw 합계 | `dist/assets/*.js` | `fs.statSync` |
| B3 | JS gzip 합계 | `dist/assets/*.js` | `zlib.gzipSync(level=9)` |
| B4 | 진입 청크 gzip | `dist/assets/index-*.js` | 위와 동일 |
| B5 | 최대 lazy 청크 raw | `dist/assets/*.js` 중 max | 목록 정렬 |
| N1 | 홈("/") 로딩 시 encoded transfer 총합 | CDP | `Network.loadingFinished.encodedDataLength` 합계 |
| N2 | 홈 로딩 시 요청 수 | CDP | `Network.requestWillBeSent` count |
| N3 | 홈 로딩 시 JS encoded transfer | CDP | `Script` 타입 필터 |
| C1 | 콘솔 warning/error 개수 | Playwright | `page.on("console")` |
| C2 | pageerror 개수 | Playwright | `page.on("pageerror")` |
| R1 | 리포 소스 트리 크기 | 루트 | `repoSourceSize()` (`.git`/`node_modules`/`dist`/`dist-electron`/`perf-out`/`.omc` 제외) |

**주요 판정**은 B3, B4, N1, N3. **회귀 임계값**: 각 지표 +5% 이상 → diff exit 1.

---

## 3. 측정 파이프라인 (사람 손 0)

### 3.1 스크립트: `scripts/perf-measure-bundle.mjs`

```bash
npm run perf:bundle:before   # 변경 전 스냅샷
npm run perf:bundle:after    # 변경 후 스냅샷
npm run perf:bundle:diff     # before ↔ after 리포트
```

동작 (실제 구현):

1. **정리**: `dist/` 재귀 삭제.
2. **빌드**: `npm run build:web` 서브프로세스. 실패 시 즉시 abort.
3. **번들 스캔**: `dist/` 재귀 walk → B1~B5, R1 계산 후 `bundle.json` 저장.
4. **런타임 캡처** (Playwright + Chromium **headless=true**):
   - 자유 포트 잡아 `vite preview --port <port> --strictPort` 서브프로세스 기동. HTTP 준비 대기(최대 20초).
   - Playwright `context.newContext({ recordHar })` 로 `har.json`.
   - CDP `Network.enable` + `requestWillBeSent`/`responseReceived`/`loadingFinished` 로 각 요청의 `encodedDataLength` 수집. `vite preview` 가 Content-Length 를 안 주는 경우가 있어 응답 헤더 대신 CDP 이벤트를 원천으로 씀.
   - `page.on("console")`, `page.on("pageerror")`, `page.on("requestfailed")` 로 콘솔·에러 수집.
   - CDP `Profiler.startPreciseCoverage({ callCount: true, detailed: true })` + `Debugger.getScriptSource` 로 초기 로딩 후 JS 미사용 바이트 산출. CSS 는 `CSS.startRuleUsageTracking`.
5. **결과**: `perf-out/bundle/<label>/summary.md` + `bundle.json` + `network.json` + `console.json` + `coverage.json` + `har.json`.
6. **diff 모드**: 두 스냅샷 로드 → 표 리포트 `perf-out/bundle/diff.md`. 주요 지표 +5% 이상 회귀 시 exit 1.

---

## 4. 작업 로드맵 (계획)

각 스텝은 독립 PR. 앞선 스텝과 무관하게 롤백 가능.

### Step 1 — 죽은 자산 삭제 (`font/DungGeunMo.woff2`)

- 근거: §1.5.
- 조작: `git rm font/DungGeunMo.woff2`.
- 사전 검증: `grep -rln "DungGeun" --exclude-dir=…` 결과 0건 재확인.
- 예상: **B1~B4 변화 0**, **R1 -924 KB**.
- 위험: 없음.

### Step 2 — `AiActionRunner` + `CommandPalette` 동시 lazy

- 근거: §1.2, §1.6. **주의: 둘 중 하나만 lazy 로 옮기면 다른 사슬이 살아 있어 zod 가 index 에 그대로 남는다.**
- 조작:
  1. `src/App.tsx:19-20` 정적 임포트를 `lazy(() => import(...))` 두 개로 전환.
  2. `<Suspense fallback={null}>` 안에 감싼다.
  3. 옵션: `command-palette.tsx` 의 단축키 리스너만 초경량 훅으로 분리해 App.tsx 에 남기고, 실제 팔레트 UI 트리와 `validateAiActions` 호출은 첫 발화 시 dynamic import.
- 검증: after 후 `grep -oE 'zod' dist/assets/index-*.js | wc -l` 이 크게 감소하는지.
- 예상: **B4 (index gzip) -15~30 KB**. 옵션 리팩터까지 하면 -25~40 KB.
- 취소 조건: B4 개선 없거나 `grep zod` 카운트 그대로면 원인 재조사.

### Step 3 — `ReactQueryDevtools` dev-only 링크

- 근거: §1.4.
- 조작: `src/App.tsx:10` 정적 임포트 제거, `import.meta.env.DEV` 브랜치에서만 `await import("@tanstack/react-query-devtools")`.
- 예상: B4 -3~10 KB.

### Step 4 — recharts 분리 로드

- 근거: §1.3.
- Plan A (분리 로드, 저위험): `advancedChunks.groups` 로 recharts 를 별도 청크로.
- Plan B (교체, 고위험): `recharts` → 경량 SVG 라인차트 또는 `@nivo/line` 서브셋.
- 시작: **Plan A만**. Plan B 는 A 가 목표를 못 채울 때 별개 스파이크로.

### Step 5 — 나머지 top-level UI 정리

- 근거: §1.6.
- 조작: `ScreenPickerModal`(App.tsx:98), `UpdateNotifier`(App.tsx:176) 를 lazy + Suspense. `GlobalInitializer`, `ServiceWorkerRegister` 는 부팅용이라 eager 유지.
- 예상: B4 -5~15 KB.

### Step 6~8 (스코프 밖)

- Step 6 (Electron `asarUnpack`), Step 7 (런타임 폴러/타이머), Step 8 (axios/qs) 은 웹 번들 관심사와 다르므로 유보.

---

## 5. 실행 결과

**전체 누적 diff**: `perf-out/bundle/cumulative-diff.md` (baseline `perf-out/bundle/baseline/` 대비, 로컬 전용).

| Step | 조작 | 결과 | 판정 |
|---|---|---|---|
| 1 | `font/DungGeunMo.woff2` 삭제 | R1 -28.0%. 번들 무변 | ✓ |
| 2 | `AiActionRunner` + `CommandPalette` 동시 lazy + `advancedChunks` 로 tanstack query 별도 청크 강제 | index -1.1%, 최대 청크 -2.5%. zod 편승 완전 제거 (index 안 zod 지문 329 → 0). tanstack query 42.2 KB 청크로 격리. **첫 시도(advancedChunks 없이) 는 tanstack 이 index 로 편입되며 +5.7% 회귀 → 재시도로 통과** | ✓ |
| 3 | `ReactQueryDevtools` `import.meta.env.DEV` 브랜치 dynamic import | 판정 지표 무변. Rolldown 이 프로덕션 빌드에서 이미 tree-shake 완료 상태였음. 리스크 0 유지 관점에서 의의 | ✓ |
| 4 | **취소** — recharts `advancedChunks` 격리 시도 | recharts 청크가 rolldown 에 의해 공용 vendor 로 오인 → 홈에서 modulepreload 되어 홈 transfer +42.7% 회귀. 리버트. 별도 이슈로 남김 (아래 §6) | 취소 |
| 5 | `ScreenPickerModal` + `UpdateNotifier` lazy | index -2.9%. lazy 청크 4개 추가 | ✓ |

**미달 원인 (총평).**

- Step 2 의 zod 편승 제거는 성공했지만 gzip 압축 후 실제 감량은 크지 않았다. zod 가 반복 패턴이라 원래도 gzip 이 잘 됐고, 청크 분리에 따르는 mapDeps 테이블/HTTP 오버헤드가 감량을 부분 상쇄.
- Step 3 은 rolldown 이 이미 devtools 를 tree-shake 완료했기에 감량 여지가 사실상 없었음. 문서화 관점에서만 의의.
- Step 4 가 취소되면서 최대 감량 여지(record 청크)를 못 건드림. 리팩터 규모 있는 Plan B(dynamic import) 는 아래 §6 으로.
- 리포 크기(R1)와 초기 라우트 latency 는 명확히 개선. **초기 페이지 로딩 latency -19.6% 는 사용자 체감에 가장 큰 영향.**

---

## 6. 남은 이슈 (별도 스파이크)

**Step 4 Plan B — recharts 를 record 페이지 내부에서 실제 dynamic import.**

Step 4 Plan A(`advancedChunks` 로 vendor 격리) 가 취소된 후 남은 대안. `components/my-stats-page.tsx`, `components/statics-section.tsx` 안의 차트 컴포넌트(BarChart 등)를 별도 파일로 뽑고 `React.lazy` + `Suspense` 로 감싼다.

- 기대: record 첫 진입 시 통계 레이아웃과 차트가 병렬 로드되어 렌더 latency 개선. 총 다운로드량 자체는 크게 안 줄어들 수 있음.
- 리스크: 리팩터 규모 중간. 차트 컴포넌트를 분리하면서 props 인터페이스와 loading fallback UI 계약을 명시해야 함.
- 판정: 자동화 파이프라인의 record 페이지 시나리오 스크립트를 별도 신설해야 정확한 실측 가능(현재 스크립트는 홈 로딩만 캡처).

**계획 §4 Step 6/7/8 은 웹 번들과 별도 관심사이므로 이 세션 스코프 밖:**

- Step 6 (Electron asarUnpack): [Electron 문서](./lightening-electron-app.md) 참고.
- Step 7 (런타임 폴러/타이머): 별도 CPU 지표 캡처 로직 필요.
- Step 8 (axios/qs): 서비스 레이어 리팩터 필요. 감량 대비 비용 크므로 유보.

---

## 7. 취소 조건 (언제 롤백하나)

- 단계 착수 후 자동 측정에서 **주요 판정 지표(B3, B4, N1, N3) 중 어느 하나도 개선이 없거나** 회귀가 있으면 해당 PR 을 리버트.
- 취소된 단계는 원인 재조사 후 별도 이슈로. "다시 시도"는 다음 PR 로.
- 회귀 감시 지표(C1, C2, N2)가 악화되면 감량이 있더라도 rework.

---

## 8. 재현 방법

```bash
# 1. 의존성 (Node 20.19+ 권장. 20.13에서는 rolldown 네이티브 바이너리 수동 설치가 필요할 수 있음)
npm install
# 필요 시: npm i @rolldown/binding-darwin-arm64 --no-save

# 2. baseline 실측 (판정 원천)
npm run perf:bundle:before   # → perf-out/bundle/before/summary.md

# 3. 특정 청크 안 라이브러리 지문 검사
grep -oE 'zod|recharts|react-rnd|react-icons|@radix-ui|axios|@tanstack' \
  dist/assets/index-*.js | sort | uniq -c | sort -rn

# 4. 변경 후 비교
npm run perf:bundle:after
npm run perf:bundle:diff     # 임계값 초과 시 exit 1
```

---

## 9. 산출물 위치

- 이 문서 (원인 · 계획 · 결과 통합): `docs/lightening-web-bundle.md`
- 측정 스크립트: `scripts/perf-measure-bundle.mjs`
- 스냅샷/리포트 (로컬 전용, `.gitignore`): `perf-out/bundle/{baseline,before,after}/`, `perf-out/bundle/{diff,cumulative-diff}.md`
- npm 스크립트: `perf:bundle:{before,after,diff}` (`package.json`)
- CI 훅: `.github/workflows/perf-bundle.yml` (미신설, 별도 PR)

Electron 데스크탑 앱 감량은 [`docs/lightening-electron-app.md`](./lightening-electron-app.md) 참고. 두 파이프라인은 독립적으로 굴린다.
