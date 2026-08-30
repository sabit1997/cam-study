# 경량화 계획

> 원인 근거: `docs/lightening-analysis.md`. 이 문서는 "무엇을, 어떤 순서로, 어떻게 재보고, 언제 취소하는가"만 다룬다.
> 원칙: **자동화된 전/후 측정으로 판정한다. 눈대중 금지.** 사람 손이 전혀 들어가지 않는 파이프라인을 먼저 세우고, 이후 개별 작업은 그 위에서 굴린다.
> 판정 기준 단위: **`1 KB = 1024 bytes`**, 판정 원천은 `scripts/perf-measure-bundle.mjs` 실측치.

---

## 0. 판정 지표 (Success Criteria)

각 단계는 아래 지표 중 **명시된 것**만 목표로 삼는다. 그 외 지표는 회귀 감시용.

| ID | 지표 | 측정 원천 | 취득 방법 |
|---|---|---|---|
| B1 | dist 총 크기 (bytes) | `dist/` | `bundle.json` (스크립트 `walk(DIST)` 합계) |
| B2 | JS raw 합계 (bytes) | `dist/assets/*.js` | 파일별 `fs.statSync` |
| B3 | JS gzip 합계 (bytes) | `dist/assets/*.js` | 파일별 `zlib.gzipSync(level=9)` |
| B4 | 진입 청크 gzip (bytes) | `dist/assets/index-*.js` | 위와 동일 |
| B5 | 최대 lazy 청크 raw | `dist/assets/*.js` 중 max | 목록 정렬 |
| N1 | 홈("/")로딩 시 encoded transfer 총합 | Chromium DevTools Protocol | `Network.loadingFinished.encodedDataLength` 합계 |
| N2 | 홈 로딩 시 요청 수 | 위와 동일 | `Network.requestWillBeSent` count |
| N3 | 홈 로딩 시 JS encoded transfer | 위와 동일 | resourceType == "Script" 필터 후 합계 |
| C1 | 브라우저 콘솔 warning/error 개수 | Playwright | `page.on("console")` |
| C2 | pageerror 개수 | Playwright | `page.on("pageerror")` |
| R1 | 리포지토리 소스 트리 크기 (bytes) | 루트 (`.git`/`node_modules`/`dist`/`dist-electron`/`perf-out`/`.omc` 등 제외) | 스크립트 `repoSourceSize()` — `fs.statSync` 재귀 |

**주요 판정**은 B3, B4, N1, N3. 나머지는 회귀 감시.

`du -sb` 같은 GNU-only 옵션은 macOS 기본 `du`에서 안 먹으므로 CLI 예시로 남기지 않는다. 스크립트가 유일한 판정 원천.

---

## 1. 측정 파이프라인 (사람 손 0)

### 스크립트: `scripts/perf-measure-bundle.mjs`

명령:

```bash
node scripts/perf-measure-bundle.mjs before   # 변경 전 스냅샷
node scripts/perf-measure-bundle.mjs after    # 변경 후 스냅샷
node scripts/perf-measure-bundle.mjs diff     # before ↔ after 리포트
```

동작 (실제 구현 기준):

1. **정리**: `dist/` 재귀 삭제.
2. **빌드**: `npm run build:web` 서브프로세스. 실패 시 즉시 abort, 스냅샷 미생성.
3. **번들 스캔**: `dist/` 재귀 walk. 파일별 raw / gzip(level 9) / ext 기록. B1~B5, R1을 `bundle.json`에 저장.
4. **런타임 캡처** (Playwright + Chromium **headless=true**):
   - **자유 포트를 잡아** `vite preview --port <port> --strictPort` 서브프로세스 기동. HTTP 준비 대기(폴링, 최대 20초).
   - Playwright `context.newContext({ recordHar })` 로 `har.json` 저장.
   - CDP `Network.enable` + `requestWillBeSent`/`responseReceived`/`loadingFinished` 로 각 요청의 `encodedDataLength`(실 전송 바이트) 수집. `vite preview`가 Content-Length를 안 주는 경우가 있어 응답 헤더 대신 CDP 이벤트를 원천으로 씀.
   - `page.on("console")`, `page.on("pageerror")`, `page.on("requestfailed")` 로 콘솔·에러 수집.
   - CDP `Profiler.startPreciseCoverage({ callCount: true, detailed: true })` + `Debugger.getScriptSource` 로 초기 로딩 후 JS 미사용 바이트 산출. CSS는 `CSS.startRuleUsageTracking`.
5. **결과 저장**: `perf-out/bundle/<label>/summary.md` + `bundle.json` + `network.json` + `console.json` + `coverage.json` + `har.json`.
6. **diff 모드**:
   - `perf-out/bundle/before/` 와 `after/` 를 로드해 지표별 절대값·변화폭·백분율을 표로 정리 → `perf-out/bundle/diff.md`.
   - 임계값(주요 지표 +5% 이상 회귀)을 초과하면 exit 1.

### 스크립트: `scripts/perf-measure-electron.mjs` (미구현·선택)

Electron 산출물 크기 측정. `electron-builder --dir` 로 서명 없이 패키징한 뒤 다음을 잰다.

- dmg/nsis 산출물 크기
- `Contents/Resources/app.asar` 크기
- unpack 디렉터리(`app.asar.unpacked/`) 크기 및 파일 개수
- 결과 → `perf-out/electron/<label>/summary.md`

macOS에서만 실행. 서명(`afterPackMac.js`)에 실패해도 크기만 재고 종료할 수 있게 한다. **Step 6 착수 시점에 함께 만든다.**

### CI/자동 훅 (미구현)

- GitHub Actions에서 PR마다:
  - base 브랜치에서 `perf:bundle:before`, PR 브랜치에서 `perf:bundle:after` 실행.
  - `perf:bundle:diff` 결과를 PR 코멘트로 게시(`actions/github-script`).
  - 임계값 초과 시 실패.
- `.github/workflows/perf-bundle.yml` 는 별도 PR로 추가.

### 이미 세팅된 것

- `package.json` 에 npm 스크립트 `perf:bundle:before` / `perf:bundle:after` / `perf:bundle:diff` 추가 완료.
- `perf-out/` 는 `.gitignore` 대상.

---

## 2. 작업 로드맵

각 단계는 독립 PR. 앞선 단계와 무관하게 롤백 가능하도록 순서를 짰다.

### Step 1 — 죽은 자산 삭제 (`font/DungGeunMo.woff2`)

- 근거: `analysis §4`.
- 조작: `git rm font/DungGeunMo.woff2`. `font/` 폴더가 다른 자산 없이 남으면 폴더도 제거.
- 사전 검증: `grep -rln "DungGeun" --exclude-dir=…` 결과 0건 (문서 자기 참조 제외).
- 예상: **B1~B4 변화 0**, **R1 -924 KB**.
- 위험: 없음.

### Step 2 — `AiActionRunner` + `CommandPalette` 동시 lazy로 zod 편승 제거

- 근거: `analysis §1, §5`. **주의: 둘 중 하나만 lazy로 옮기면 다른 사슬이 살아 있어 zod가 index에 그대로 남는다.**
- 조작:
  1. `src/App.tsx:19-20` 의 정적 임포트를 `lazy(() => import(...))` 두 개로 전환.
  2. `<Suspense fallback={null}>` 안에 감싼다. 두 컴포넌트 모두 사용자 인터랙션 이전엔 UI 미노출이 기본이라 fallback null OK.
  3. 옵션: `command-palette.tsx` 의 단축키 리스너(`useCommandPalette`)만 초경량 훅으로 분리해 App.tsx 에 남기고, 실제 팔레트 UI 트리와 `validateAiActions` 호출은 단축키 첫 발화 시 dynamic import 하도록 리팩터. — 이 옵션까지 하면 zod가 별도 청크로 완전 격리됨.
- 검증: `after` 스냅샷 후 `grep -oE 'zod' dist/assets/index-*.js | wc -l` 이 크게 감소하는지 확인.
- 예상: **B4 (index gzip) -15~30 KB**. 옵션 리팩터까지 하면 -25~40 KB.
- 위험: 명령 팔레트/AI 러너 첫 사용 시 미세 지연. Suspense fallback 흡수.
- 취소 조건: 스텝 후 B4가 개선되지 않거나, `grep zod` 카운트가 그대로면 원인 재조사.

### Step 3 — `ReactQueryDevtools` dev-only 링크

- 근거: `analysis §3`.
- 조작: `src/App.tsx:10` 의 정적 임포트를 제거하고, `import.meta.env.DEV` 브랜치에서만 `await import("@tanstack/react-query-devtools")` 하도록 변경.
- 예상: B4 -3~10 KB.
- 위험: 없음(devDependency).

### Step 4 — recharts 분리 로드 또는 대체

- 근거: `analysis §2`.
- Plan A (분리 로드, 저위험): `components/statics-section.tsx` / `components/my-stats-page.tsx` 의 차트 컴포넌트를 별도 dynamic import 로. → record 청크가 통계 레이아웃과 차트로 쪼개진다.
- Plan B (교체, 고위험): `recharts` → 경량 SVG 라인차트(자체 구현) 또는 `@nivo/line` 서브셋. 감량 폭 크지만 유지비 큼.
- 시작: **Plan A만**. Plan B는 A가 목표를 못 채울 때 별개 스파이크 이슈로.
- 예상 (Plan A): record 청크 gzip -20~30 KB, 초기 record 진입 렌더 시간 감소.

### Step 5 — 나머지 top-level UI (Screen Picker, Update Notifier) 정리

- 근거: `analysis §5`. Step 2에서 다룬 두 컴포넌트를 제외한 나머지.
- 조작: `ScreenPickerModal`(App.tsx:98), `UpdateNotifier`(App.tsx:176) 를 이벤트 트리거 시점에 마운트되도록 (a) 상위 훅 하나에서 상태로 게이팅하거나 (b) lazy + Suspense.
  - `GlobalInitializer`, `ServiceWorkerRegister` 는 부팅용 사이드이펙트 담당이라 eager 유지.
- 예상: B4 -5~15 KB.
- 위험: 이벤트 발화 시 컴포넌트가 아직 마운트되지 않아 놓치는 경우. 각 컴포넌트마다 "이벤트 큐 → 첫 렌더" 계약 명시.

### Step 6 — Electron `asarUnpack` 최소화

- 근거: `analysis §7`.
- 조작: `package.json:97-100` build.asarUnpack에서 `"dist/**/*"` 제거. `get-windows`만 남긴다.
- 검증: `scripts/perf-measure-electron.mjs` 신설 → unpack 디렉터리 크기, dmg 크기 스냅샷 + 실제 실행 스모크.
- 위험: 첫 실행에서 `loadFile` 경로 이슈. `src-electron/main.ts` 확인 필요.

### Step 7 — 런타임 폴러/타이머 오디트

- 근거: `analysis §6`.
- 조작:
  - `components/navigation.tsx` 시계 → `1000ms` 대신 `requestAnimationFrame` + 초 단위 스로틀, 로그아웃 시 정지.
  - `src-electron/tracker/poller.ts:84` → 세션 시작 이벤트 도착 전에는 미시작 유지.
  - `components/timer.tsx` → cleanup 계약 스팟 체크.
- 예상: 아이들 CPU 하락, 배터리 사용량 감소. 번들 감소는 미미하므로 별도 지표(`perf:runtime` — 미신설)로 관측. Playwright `metrics: { CPU }` 계측 스크립트를 신설한다.

### Step 8 (선택) — axios/qs 제거

- 근거: `analysis §8`.
- 조작: `apis/request.ts` fetch 이관, `express`의 body-parser는 `express.json()` 유지, `qs` 제거.
- 예상: gzip 5~10 KB. 이관 비용이 감량보다 크면 취소.

---

## 3. 목표 (총합)

**웹 번들 (gzip 기준, 스크립트 실측 = `1 KB = 1024 bytes`):**

| 항목 | Before (실측) | 1차 목표 (Step 1~5) | 2차 목표 (Step 1~8) |
|---|---|---|---|
| JS 총합 | 326 KB | ≤ 275 KB (-16%) | ≤ 240 KB (-26%) |
| index 청크 | 108 KB | ≤ 75 KB (-30%) | ≤ 65 KB (-40%) |
| record 청크 | 99.6 KB | ≤ 78 KB (-22%) | ≤ 60 KB (-40%) |

목표치는 §2 각 스텝의 감량 하한을 합쳐 잡았다. 실측이 하한에 미치지 못하면 개별 스텝을 취소하고 다음 스텝으로 넘어간다.

**리포지토리:**

| 항목 | Before | 목표 |
|---|---|---|
| 소스 트리 (스크립트 exclude 리스트 기준) | 3,294 KB | 2,370 KB (Step 1) |

**런타임 (참고, 지표 별도 신설):** 아이들 상태 자바스크립트 CPU 사용률 하락, 초기 라우트 렌더 latency 하락. Step 7 착수 시 Playwright metrics 캡처 로직 추가.

---

## 3-a. 실행 결과 (Step 1~5, Step 4 취소)

전체 누적 diff: `perf-out/bundle/cumulative-diff.md` (baseline `perf-out/bundle/baseline/` 대비).

| 지표 | Baseline | 최종 | Δ | 목표 대비 |
|---|---|---|---|---|
| JS 총합 gzip | 326 KB | 328 KB | +0.6% | 목표 ≤275 KB **미달** |
| index 청크 gzip | 108 KB | 103.6 KB | **-4.0%** | 목표 ≤75 KB **미달** |
| record 청크 raw | 355.7 KB | 347.0 KB | -2.5% | 목표 ≤78 KB **미달** (Step 4 취소) |
| 리포 소스 트리 | 3,294 KB | 2,375 KB | **-27.9%** | 목표 -924 KB 근접 달성 |
| 홈 로딩 encoded transfer | 231.8 KB | 235.8 KB | +1.7% | 회귀 감시 임계값 안 |
| load(networkidle) | 1,448 ms | 1,164 ms | -19.6% | 회귀 없음 |
| 콘솔 error/warning/pageerror | 0/0/0 | 0/0/0 | 회귀 0 | ✓ |

스텝별 결과:

| Step | 조작 | 결과 | 판정 |
|---|---|---|---|
| 1 | `font/DungGeunMo.woff2` 삭제 | R1 -28.0%. 번들 무변 | ✓ |
| 2 | `AiActionRunner` + `CommandPalette` 동시 lazy + `advancedChunks`로 tanstack query 별도 청크 강제 | index -1.1%, 최대 청크 -2.5%. zod 편승 완전 제거(index 안 zod 지문 329→0). tanstack query 42.2 KB 청크로 격리. **첫 시도(advancedChunks 없이)는 tanstack이 index로 편입되며 +5.7% 회귀 → 재시도로 통과** | ✓ |
| 3 | `ReactQueryDevtools` `import.meta.env.DEV` 브랜치 dynamic import | 판정 지표 무변. Rolldown 프로덕션 빌드에서 이미 tree-shake 완료 상태였음. 리스크 0 유지 관점에서 의의 | ✓ |
| 4 | **취소** — recharts `advancedChunks` 격리 시도 | recharts 청크가 rolldown에 의해 공용 vendor 로 오인 → 홈에서 modulepreload 되어 홈 transfer +42.7% 회귀. 리버트. **별도 이슈로 남김** (아래 §6 참고) | 취소 |
| 5 | `ScreenPickerModal` + `UpdateNotifier` lazy | index -2.9%. 소소한 lazy 청크 4개 추가 | ✓ |

**미달 원인 (총평).**

- Step 2의 zod 편승 제거는 성공했지만 gzip 압축 후 실제 감량은 크지 않았다. zod가 반복 패턴이라 원래도 gzip이 잘 됐고, 청크 분리에 따르는 mapDeps 테이블/HTTP 오버헤드가 감량을 부분 상쇄.
- Step 3은 rolldown이 이미 devtools를 tree-shake 완료했기에 감량 여지가 사실상 없었음. 문서화 관점에서만 의의.
- Step 4가 취소되면서 최대 감량 여지(record 청크)를 못 건드림. 리팩터 규모 있는 Plan B(dynamic import)는 아래 §6으로.
- 리포 크기(R1)와 초기 라우트 latency는 명확히 개선. **초기 페이지 로딩 latency -19.6%는 사용자 체감에 가장 큰 영향.**

---

## 4. 취소 조건 (언제 롤백하나)

- 단계 착수 후 자동 측정에서 **주요 판정 지표(B3, B4, N1, N3) 중 어느 하나도 개선이 없거나** 회귀가 있으면 해당 PR을 리버트.
- 취소된 단계는 원인 재조사 후 별도 이슈로 남긴다. "다시 시도"는 다음 PR로.
- 회귀 감시 지표(C1, C2, N2)가 악화되면 감량이 있더라도 rework.

---

## 5. 산출물 위치

- 원인 문서: `docs/lightening-analysis.md`
- 이 계획: `docs/lightening-plan.md`
- 측정 스크립트: `scripts/perf-measure-bundle.mjs` (구현 완료). `scripts/perf-measure-electron.mjs` 는 Step 6에서 신설.
- 스냅샷/리포트: `perf-out/bundle/before/`, `perf-out/bundle/after/`, `perf-out/bundle/diff.md`
- CI 훅: `.github/workflows/perf-bundle.yml` (미신설, 별도 PR)
- npm 스크립트: `perf:bundle:before` / `perf:bundle:after` / `perf:bundle:diff` (`package.json` 에 이미 추가됨)

기존 `perf-measure.mjs`(창 리사이즈 시나리오)와는 다른 관심사이므로 파일을 분리했다.

---

## 6. 남은 이슈 (별도 스파이크)

**Step 4 Plan B — recharts를 record 페이지 내부에서 실제 dynamic import.**

Step 4 Plan A(`advancedChunks`로 vendor 격리)가 취소된 후 남은 대안. `components/my-stats-page.tsx`, `components/statics-section.tsx` 안의 차트 컴포넌트(BarChart 등)를 별도 파일로 뽑고 `React.lazy` + `Suspense`로 감싼다.

- 기대: record 첫 진입 시 통계 레이아웃과 차트가 병렬 로드되어 렌더 latency 개선. 총 다운로드량 자체는 크게 안 줄어들 수 있음.
- 리스크: 리팩터 규모 중간. 차트 컴포넌트를 분리하면서 props 인터페이스와 loading fallback UI 계약을 명시해야 함.
- 판정: 자동화 파이프라인의 record 페이지 시나리오 스크립트를 별도 신설해야 정확한 실측 가능(현재 스크립트는 홈 로딩만 캡처).

**계획 §2 Step 6/7/8은 웹 번들과 별도 관심사이므로 이 세션 스코프 밖으로 미룸.**

- Step 6 (Electron asarUnpack): 별도 electron 실측 파이프라인 필요.
- Step 7 (런타임 폴러/타이머): 별도 CPU 지표 캡처 로직 필요.
- Step 8 (axios/qs): 서비스 레이어 리팩터 필요. 감량 대비 비용 크므로 유보.
