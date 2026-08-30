# 경량화 원인 분석

> 목적: 이 앱이 "무겁다"고 느껴지는 지점을 실측치로 짚어내고, 뒤이은 경량화 계획(`docs/lightening-plan.md`)의 근거를 남긴다.
> 스코프: 웹 번들(Vercel) + Electron 데스크탑 패키지 + 런타임 오버헤드. Vite 8 / React 19 / Electron 43 기준.
> 측정 커밋: `main` (분석 당시 HEAD). 재현 방법은 문서 하단 "재현 방법" 참고.
> 수치 기준: **`scripts/perf-measure-bundle.mjs` 실측치**. `1 KB = 1024 bytes`. `vite build` 콘솔 로그(`kB=1000`)와 값이 미묘하게 다르나 판정 원천은 스크립트로 통일한다.

---

## 0. 지표 요약 (Before 스냅샷)

`npm run perf:bundle:before` 실측치 (`perf-out/bundle/before/summary.md`).

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

> Electron 패키지 실측은 macOS 코드사인 우회(`afterPackMac.js`) 및 네이티브 리빌드 이슈 때문에 CI에서만 신뢰 가능. Plan §1의 `scripts/perf-measure-electron.mjs`(선택 스크립트)로 스냅샷을 남길 수 있다.

---

## 1. 진입 청크(index-*.js, gzip 108 KB)에 zod 스키마가 통째로 편승

**증거.**

- `dist/assets/index-*.js` 내 심볼 지문: `grep -oE 'zod' index-*.js | wc -l` → **329회 등장** (다른 라이브러리 지문은 검출 안 됨).
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

- `types/ai-actions.ts`를 값(runtime)으로 import하는 파일은 실제로 **`utils/ai-action-validate.ts` 단 하나** (`grep` 결과). 나머지 참조는 전부 `import type`이라 컴파일에서 지워진다.
- 그 `ai-action-validate`를 값으로 참조하는 최상위 진입점이 `AiActionRunner`(App.tsx:19)와 `CommandPalette`(App.tsx:20)이고, 둘 다 top-level static import이므로 index 청크에 편승된다.

**왜 문제인가.**

- Vite/Rolldown은 `App.tsx`가 정적으로 참조하는 모든 심볼을 진입 청크에 몰아 넣는다. 두 컴포넌트는 사실상 사용자가 이벤트를 발화하기 전까지 UI를 노출하지 않는다.
- zod v4 자체가 tree-shake가 잘 되는 라이브러리라 문제는 zod가 아니라 **eager 진입점에서 검증 스키마를 참조한다는 배치의 문제**다.

**주의 (계획에 반영).** 둘 중 하나만 lazy로 옮기면 다른 하나가 여전히 사슬을 유지해 zod가 index에 남는다. **`AiActionRunner` + `CommandPalette` 를 함께** lazy로 옮기거나, `validateAiActions`가 zod 스키마를 즉시 참조하지 않도록 리팩터해야 한다.

**추정 영향.** gzip 기준 index 청크 -15~30 KB(zod v4 core 규모). 실측은 자동화 스크립트가 판정.

---

## 2. `record` 페이지 청크가 recharts 통째로 안고 있다

**증거.**

- `dist/assets/record-*.js`: **347 KB (raw) / 99.6 KB (gzip)**
- `grep -oE 'recharts' record-*.js | wc -l` → **60회 등장**
- 참조 위치: `components/my-stats-page.tsx`, `components/statics-section.tsx` (recharts LineChart 등).

**왜 문제인가.**

- 통계/기록 페이지는 lazy chunk라 초기 로딩엔 안 들어오지만, "기록" 탭 첫 진입 시 gzip 99.6 KB를 통째로 다운로드한다.
- recharts는 사용된 컴포넌트만 임포트하더라도 D3 하위 의존 때문에 감량이 제한적이다. 대안은 (a) 차트 자체를 dynamic import로 한 번 더 쪼개기(라이브러리는 유지), (b) 경량 SVG 렌더러로 교체.

**추정 영향.** (a) record 첫 진입 시 non-chart 부분이 먼저 렌더되므로 실사용 렌더 latency 감소. 단, 총 다운로드량은 크게 안 줄어들 수 있음. (b) 교체 성공 시 gzip 40~60 KB 감량 가능. 판정은 실측.

---

## 3. `config` / `useQuery` 청크 = @tanstack/react-query 부담

**증거.**

- `dist/assets/config-*.js`: 99.4 KB / 33.5 KB (gzip)
- `dist/assets/useQuery-*.js`: 15.9 KB / 5.3 KB, `mutation-*.js`, `middleware-*.js` 다수
- 지문 검사: `config-*.js` 안에서 `QueryClient` 2회, `Mutation` 5회 등장 (minify로 대부분 심볼 소실).
- `src/App.tsx:9-10`에서 `QueryClientProvider`, `ReactQueryDevtools` eager 임포트.
- `src/App.tsx:190,197` — Profiler는 `import.meta.env.DEV` 가드가 있지만 **`ReactQueryDevtools`는 컴포넌트 트리에서만 조건부일 뿐 모듈 임포트는 무조건 진행**된다.

**왜 문제인가.**

- react-query 자체는 필수라 통째로 줄이긴 어렵다. 다만 `ReactQueryDevtools`는 devtools 패키지로 프로덕션 노-op 렌더링을 하더라도 모듈 그래프에 남아 사이드이펙트에 따라 몇 KB 잔재가 생길 수 있다.
- 리스크 낮은 개선: devtools를 dynamic import + `import.meta.env.DEV` 가드로 옮겨 프로덕션 그래프에서 완전히 분리.

**추정 영향.** gzip 3~10 KB (실측 필요).

---

## 4. 죽은 에셋: `font/DungGeunMo.woff2` (924 KB)

**증거.**

- 파일 크기 946,116 바이트 (924 KB).
- 참조 검색:
  - `grep -rln "DungGeun" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=perf-out .` — 이 문서 두 개(`docs/lightening-*.md`) 외 0건.
  - `src/globals.css` — Google Fonts Inter 사용(`index.html:12`), 로컬 폰트 `@font-face` 없음.
- Vite `publicDir: "public"` 설정상 `font/`는 웹 번들에 포함되지 않는다.
- `package.json` build.files는 `dist-electron/**/*`, `dist/**/*`만 포함하므로 **Electron 패키지에도 포함되지 않는다.**

**왜 문제인가.**

- 배포 산출물엔 없지만 **리포지토리 클론/CI/Docker 컨텍스트/에디터 인덱싱**에서 매번 924 KB를 실어 나른다.
- 코드 리뷰 시 "쓰이지 않는 리소스"가 그대로 있는 것도 유지보수 신호로 나쁘다.

**추정 영향.** 리포 소스 트리 3,294 KB → **2,370 KB** (-28%). 배포 산출물엔 영향 없음.

---

## 5. 톱-레벨에 상주하지만 즉시 필요 없는 컴포넌트들

**증거 (`src/App.tsx:92~104`, AppShell).**

- 항상 마운트: `GlobalInitializer`(95), `ServiceWorkerRegister`(96), `ScreenPickerModal`(98), `AiActionRunner`(99), `CommandPalette`(100), `UpdateNotifier`(176).
- 이들 다수가 "이벤트가 오기 전까지는 UI 미노출" 컴포넌트인데, 정적 임포트이므로 진입 청크에 코드가 실린다.
- (1)에서 본 zod 편승은 이 배치의 결과.

**왜 문제인가.**

- 모달·명령 팔레트·업데이터 뱃지를 eager로 유지할 이유가 약하다. 첫 진입 latency는 실제 사용자 인터랙션 없이 소비된다.
- `GlobalInitializer`, `ServiceWorkerRegister` 같은 부팅용 컴포넌트는 사이드이펙트 담당이라 eager 유지가 맞다 — 옮길 대상은 나머지.

**추정 영향.** (1)과 겹침. 총합 index gzip -20~35 KB.

---

## 6. 런타임: 항상 도는 폴러/타이머

- `components/navigation.tsx` — `setInterval(updateTime, 1000)`. 로그인 여부와 무관하게 시계가 1초마다 도는지 재확인 필요.
- `src-electron/tracker/poller.ts:84` — `setInterval(tick, opts.intervalMs)`. 세션 시작 이벤트 없이도 도는지 검증 필요.
- `components/timer.tsx` — 타이머/저장/포모도로용 다중 `setInterval`. `useEffect` cleanup으로 안전하게 정리되고 있는지 스팟 체크 필요.

이건 번들 크기가 아니라 **CPU/배터리 부담**의 원인이다. 웹 라이트하우스 점수 개선과 Electron 아이들 CPU 감소 양쪽에 걸린다.

---

## 7. Electron 패키지: `asarUnpack: ["dist/**/*", ...]`

- `package.json:97-100`에서 웹 번들 전체를 asar 밖으로 풀어 놓았다. asar는 파일 시스템 오버헤드 완화용인데, 웹 자산을 다 풀면 (a) 설치 폴더 파일 개수 증가, (b) 안티바이러스 스캔 시간 증가, (c) 자동 업데이트 시 rsync-like diff 이득 감소.
- 이유가 명확하지 않다면 `dist/**/*`는 asar 안에 두는 것이 정상. `get-windows`처럼 dlopen 필요한 네이티브 모듈만 unpack.

**추정 영향.** dmg/zip 크기 자체보다는 **설치 후 폴더 크기와 실행 초기 I/O**. Plan §1의 electron 실측 스크립트로 스냅샷.

---

## 8. 소소한 것들 (수치 근거 부족 → 확정 X)

- `components/tooltip-wrapper.tsx:1` — `import * as Tooltip from "@radix-ui/react-tooltip"`. Radix는 tree-shakeable하지만 네임스페이스 임포트는 rolldown/rollup의 사이드이펙트 판정에 따라 몇 KB 손해 볼 수 있음. 명시 임포트로 바꿔 재측정 가치.
- `axios` — `apis/`에서 사용. `fetch` 이관 시 3~5 KB(gzip) 여유. 그러나 재시도/인터셉터 정책이 서비스 계층에 물려 있으면 이관 비용 큼.
- `qs` — Express 서버에서 쿼리 파싱. 실제 라우팅에서 소비량이 낮다면 제거 후 URLSearchParams로 이관 가능.
- CSS 42.6 KB (gzip 8.2) — Tailwind 4 JIT라 이미 적당. 다크모드용 스크롤바 규칙 등 코스메틱 CSS 정리 여지는 있으나 감량 폭 미미.

---

## 재현 방법

```bash
# 1. 의존성 (Node 20.19+ 권장. 20.13에서는 rolldown 네이티브 바이너리 수동 설치가 필요할 수 있음)
npm install
# 필요 시: npm i @rolldown/binding-darwin-arm64 --no-save

# 2. 웹 번들 실측 (판정 원천)
npm run perf:bundle:before   # → perf-out/bundle/before/summary.md

# 3. 특정 청크 안 라이브러리 지문 검사
grep -oE 'zod|recharts|react-rnd|react-icons|@radix-ui|axios|@tanstack' \
  dist/assets/index-*.js | sort | uniq -c | sort -rn

# 4. 변경 후 비교
npm run perf:bundle:after
npm run perf:bundle:diff     # 임계값 초과 시 exit 1
```

자동화된 측정 파이프라인 상세는 `docs/lightening-plan.md`의 "측정 파이프라인" 섹션 참고.
