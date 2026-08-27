# 번들 · 패키지 크기 측정

이 문서는 두 가지를 담는다.

1. **4계층 측정 체계** — 앱의 크기를 어디서 어떻게 재는지, 그리고 각 계층의 숫자가 무엇을 의미하고 무엇을 의미하지 않는지.
2. **발표자료 정정** — `cam-study-측정가이드-발표자료.pdf`(2026-08-26 기준) 의 사실관계 오류. 발표자료는 PDF 로만 남아 있고 생성 소스가 없어 슬라이드를 직접 고칠 수 없으므로, **이 문서가 정정의 단일 출처다.**

런타임 렌더 성능(리사이즈 커밋 수, 렌더 시간)은 이 문서의 범위가 아니다 → [`perf-probe.md`](./perf-probe.md).

---

## 4계층

크기를 한 숫자로 말하면 반드시 틀린다. 층이 다르면 재는 대상도, 줄이는 방법도, 사용자가 체감하는 지점도 다르다.

| 계층 | 대상 | 측정 도구 | 사용자 체감 지점 |
| --- | --- | --- | --- |
| **A** | 렌더러 청크 `dist/assets/*.js` | `vite build` + rollup-plugin-visualizer | 웹 첫 로드 · 라우트 전환 |
| **B** | Electron 메인 `dist-electron/main.js` | esbuild `metafile` | 데스크탑 앱 기동 시간 |
| **C** | 프로덕션 의존성 `node_modules` | `npm ls --prod --all` + `du --apparent-size` | CI · `npm install` 시간 |
| **D** | 인스톨러 (NSIS / DMG) | `electron-builder --dir` + HTTP `Content-Length` | 다운로드 · 설치 |

### 층 사이의 관계를 오해하지 않기

- **C 는 D 에 그대로 더해지지 않는다.** `package.json` `build.files` 화이트리스트(`package.json`, `dist-electron/**/*`, `dist/**/*`)와 electron-builder 의 프로덕션 의존성 규칙이 무엇을 싣는지에 따라 갈린다 → [정정 5](#정정-5--deps-18747-mb-인스톨러-140-mb-미검증-전제).
- **D 의 대부분은 우리 코드가 아니다.** Electron 43 런타임(Chromium + Node)이 143.2 MB 이고 우리 코드(`dist` 1.4 MB + `dist-electron` 3.0 MB)는 4.4 MB — 인스톨러 233.7 MB 의 **1.9 %** 다.
- 따라서 **"233.7 − 143.2 = 90.5 MB 가 우리 것"은 틀린 계산이다.** 나머지는 압축률 차이, 리소스, 플랫폼별 바이너리다. 우리가 줄일 수 있는 표면은 4.4 MB 쪽이고, 그래서 A·B 가 실질적인 작업 대상이다.
- **raw · gzip · minify 를 섞어 비교하면 허수가 나온다.** BEFORE raw ↔ AFTER raw, gzip ↔ gzip 으로만 비교한다. B 는 minify 여부를 항상 함께 적는다.

---

## 측정하기

```bash
npm run bundle:before     # 개선 전 기준선
npm run bundle:after      # 개선 후
```

결과는 `bundle-out/<label>/` 에 떨어진다 — `summary.md`(사람이 읽는 표 + 자가점검), `raw.json`(기계가 읽는 원본). 둘 다 gitignore 대상이다.

| 옵션 | 효과 |
| --- | --- |
| `--no-build` | 빌드를 건너뛰고 기존 `dist`·`dist-electron` 으로 집계만 한다. 하네스 자체를 고칠 때 쓴다 |
| `MEASURE_INSTALLER=1` | D 계층을 켠다. `electron-builder --dir` 를 돌리므로 몇 분 걸린다 |

**동작:**

- **A** — `BUNDLE_ANALYZE=1` 로 `vite build` 를 돌려 `dist/assets/*.js` 를 raw + gzip 양쪽으로 재고, rollup-plugin-visualizer 의 `raw-data` 산출물에서 청크별 상위 패키지를 뽑는다. `BUNDLE_ANALYZE` 는 하네스가 직접 넘기므로 일반 빌드·CI 는 visualizer 를 타지 않는다.
- **B** — `npm run build:ts` 후 esbuild `metafile`(`dist-electron/meta.json`)의 `bytesInOutput` 을 패키지 단위로 합산한다. minify 여부는 설정을 읽지 않고 **산출물의 평균 줄 길이로 판정**해 기록한다 — 설정과 산출물이 어긋나는 사고를 막기 위해서다.
- **C** — `npm ls --prod --all --parseable` 로 프로덕션 패키지 경로를 받아 각 디렉터리의 apparent size 를 직접 합산한다. 중첩 `node_modules` 는 건너뛴다 — `npm ls` 가 중첩 패키지도 각각 한 줄로 내놓기 때문에 안 그러면 같은 바이트를 두 번 센다.
- **D** — `electron-builder --dir` 로 `app.asar` 를 만들고, `@electron/asar list` 로 **asar 안에 `node_modules` 가 실리는지 판정한다.** 이 판정이 C 계층 정리의 실효성을 좌우한다 → [정정 5](#정정-5--deps-18747-mb-인스톨러-140-mb-미검증-전제).

### 자가 점검

`perf-measure.mjs` 와 같은 규약으로, 리포트 끝에 점검표가 붙는다. 측정이 조용히 틀리는 것을 막는 장치다.

| 항목 | 잡아내는 사고 |
| --- | --- |
| 기준 커밋이 고정됨 | working tree 가 더러운 상태의 수치를 인용하는 것 |
| index 청크 존재 · raw/gzip 비율 2.5~5 | 엔트리 청크명 변경, gzip 계산 오류 |
| B minify 상태 기록 | raw ↔ minify 혼용 비교 |
| 프로덕션 패키지 수 380~500 | `--prod` 누락으로 devDependencies 까지 집계 |
| 프로덕션 < 전체 node_modules | 중첩 패키지 이중 계산 |
| D asar node_modules 판정 | 정정 5 를 미검증 상태로 방치 |

---

## BEFORE 기준선

기준 커밋 **`4ebbf85`** · 2026-08-27 · Node v24.18.0 · win32-x64. 원본은 `bundle-out/before/summary.md`.

### A · 렌더러 청크

| 청크 | raw | gzip |
| --- | --- | --- |
| index | 355.7 KB | 108.2 KB |
| record | 347.0 KB | 99.8 KB |
| home | 113.7 KB | 36.6 KB |
| config | 99.4 KB | 33.5 KB |
| react | 35.7 KB | 10.3 KB |
| youtube | 20.7 KB | 7.3 KB |
| **합계 (JS 24개)** | **1.03 MB** | **326.1 KB** |

CSS 42.6 KB · `dist/` 전체 1.25 MB (31 파일)

`index` 청크 내 상위 패키지:

| 패키지 | 기여 |
| --- | --- |
| react-dom | 443.0 KB |
| **zod** | **121.8 KB** |
| (앱 코드) | 104.3 KB |
| react-router | 88.4 KB |
| react-icons | 24.8 KB |
| @tanstack/query-core | 12.4 KB |

zod 121.8 KB 은 발표자료의 "122 KB" 와 일치한다 — **진단은 정확했다.** 처방만 틀렸다(정정 2). 참고로 `index` 의 최대 기여자는 react-dom 443 KB 이지만 이건 제거 대상이 아니고, zod 는 lazy 경계 하나로 빠진다.

### B · Electron 메인

| 항목 | 값 |
| --- | --- |
| main.js raw | 2.94 MB |
| main.js gzip | 591.7 KB |
| **minify** | **미적용** (평균 줄 길이 35) |
| preload.js | 2.6 KB |
| `dist-electron/` 전체 | 3.12 MB |

패키지별 기여 (상위):

| 패키지 | main.js 내 기여 |
| --- | --- |
| iconv-lite | 538.9 KB |
| express | 269.3 KB |
| send | 249.2 KB |
| type-is | 239.8 KB |
| accepts | 235.4 KB |
| electron-updater | 231.8 KB |
| mime-db | 207.6 KB |
| axios | 157.6 KB |

**귀속 방식 주의.** 위 표는 **패키지 단위**다. 발표자료의 "express 1.24 M" 은 **하위 트리 합산**이다. 실측 결과 express 하위 트리는 **1.92 MB** — main.js 2.94 MB 의 **65 %** 다(iconv-lite 538.9 KB 포함). iconv-lite 를 따로 세면 1.38 MB 로 발표자료 수치와 맞는다. 두 방식 모두 유효하나 **섞으면 안 된다** — 같은 바이트를 두 번 세게 된다.

앱 코드 자체는 38.2 KB 다. main.js 2.94 MB 중 우리가 쓴 코드는 1.3 % 이고 나머지는 전부 의존성이다.

### C · 프로덕션 의존성

| 항목 | 값 |
| --- | --- |
| 프로덕션 패키지 수 | 435 |
| 프로덕션 용량 (apparent) | 186.81 MB |
| 프로덕션 파일 수 | 13,755 |
| node_modules 전체 (dev 포함) | 880.15 MB (35,963 파일) |

| 패키지 | 용량 | 파일 |
| --- | --- | --- |
| react-icons | 84.19 MB | 143 |
| @google/genai | 16.55 MB | 25 |
| web-streams-polyfill | 8.62 MB | 43 |
| recharts | 6.99 MB | 812 |
| react-dom | 6.98 MB | 43 |
| @reduxjs/toolkit | 5.75 MB | 172 |
| react-router | 4.55 MB | 159 |
| zod | 4.35 MB | 718 |
| es-toolkit | 3.65 MB | 3,939 |

`@reduxjs/toolkit` 5.75 MB 은 이 앱이 Zustand 를 쓰는데도 프로덕션 트리에 있다 — recharts 를 통해 들어온다. 발표자료 슬라이드 17이 record 청크에서 짚은 것과 같은 것이다.

### D · 인스톨러 / asar

| 항목 | 값 |
| --- | --- |
| `app.asar` | **524.06 MB** |
| unpacked 전체 (`dist/win-unpacked/`) | 882.63 MB |
| asar 내 `node_modules` | **실림 — 10,607 / 10,720 항목** |

**결정 게이트가 닫혔다: 발표자료 정정 5의 전제는 틀렸다.** `build.files` 화이트리스트는 `node_modules` 를 배제하지 **않는다.** 프로덕션 의존성이 asar 에 그대로 실린다.

그리고 재보는 과정에서 별개의 문제가 하나 더 나왔다.

#### app.asar 안에 Electron 런타임이 중복으로 들어간다

`app.asar` 항목을 열어보면 `dist/win-unpacked/electron.exe`, `icudtl.dat`, `chrome_*.pak`, `*.dll`, `locales/*.pak` 가 들어 있다. 524.06 MB 의 구성은 이렇게 맞아떨어진다.

```
프로덕션 deps          186.81 MB
우리 코드                4.40 MB   (dist 1.25 + dist-electron 3.12)
중복된 Electron 런타임  약 333 MB
                     ─────────────
                       524.06 MB
```

원인은 설정 충돌이다.

- `package.json` `build.directories.output` 이 지정되지 않아 기본값 **`dist`** 를 쓴다.
- Vite `build.outDir` 도 **`dist`** 다.
- `build.files` 에 **`"dist/**/*"`** 가 있다.

electron-builder 는 한 번의 실행 안에서 Electron 런타임을 `dist/win-unpacked/` 로 먼저 풀고 그 다음에 asar 를 조립한다. 조립 시점의 glob 이 자기가 방금 만든 `dist/win-unpacked/**` 를 잡는다. **깨끗한 빌드에서도 재현된다** — 직전 출력을 지워도 막히지 않는다(타임스탬프로 확인: vite 16:01:24 → Electron 런타임 전개 16:01:51 → asar 조립 16:02:59).

발표자료의 인스톨러 233.7 MB(HTTP `Content-Length`)와 모순되지 않는다. 중복된 런타임은 asar 밖의 원본과 바이트가 같아 NSIS 의 LZMA 압축이 잘 지워낸다. 즉 **다운로드 크기보다 설치 후 디스크와 asar 읽기 비용에 얹히는 문제**다. 인스톨러 크기는 이번에 재측정하지 않았다.

#### 런타임에 실제로 필요한 프로덕션 패키지는 22개다

`dist/assets/*.js` 는 Vite 가, `dist-electron/main.js` 는 esbuild 가 의존성을 전부 인라인한다. esbuild `external`(`scripts/build-electron.js:55-61`)만 예외이므로 런타임에 `node_modules` 가 필요한 것은 그 3개와 전이 의존성뿐이다.

| 구분 | 패키지 | 용량 |
| --- | --- | --- |
| 런타임에 필요 | **22** | **2.53 MB** (396 파일) |
| 빌드 타임 전용 | 413 | 184.28 MB |
| 합계 (프로덕션 트리) | 435 | 186.81 MB |

필요한 22개: `get-windows`, `electron-store`, `conf`, `ajv`, `ajv-formats`, `atomically`, `debounce-fn`, `dot-prop`, `env-paths`, `fast-deep-equal`, `fast-json-stable-stringify`, `json-schema-traverse`, `json-schema-typed`, `mimic-function`, `punycode`, `semver`, `stubborn-fs`, `stubborn-utils`, `type-fest`, `uint8array-extras`, `uri-js`, `when-exit`. (`get-windows` 는 네이티브 바이너리라 `asarUnpack` 에 이미 잡혀 있다.)

`ignoredProductionDependencies` 로 정리할 때 **이 22개가 빠지면 패키징된 앱이 `MODULE_NOT_FOUND` 로 죽는다.** 이것이 정정 5가 요구한 제약의 구체적인 형태다.

두 문제를 합치면 `app.asar` 의 이론적 하한은 **약 7 MB**(우리 코드 4.4 + 런타임 의존성 2.53)이고 현재는 524 MB 다. 발표자료의 "deps 187 → 47 MB" 는 방향은 맞았지만 오히려 보수적이었다.

> 다만 "413개는 빌드 타임 전용" 은 정적 분석 결과다. 런타임 `require` 가 숨어 있을 수 있으므로 **패키징된 앱을 실제로 실행해 방해요소 tracker(get-windows)와 설정 저장(electron-store)까지 확인**해야 확정된다.

### 발표자료 수치 재현 결과

| 계층 | 항목 | 발표자료 (2026-08-26) | 실측 (`4ebbf85`) | 판정 |
| --- | --- | --- | --- | --- |
| C | 패키지 수 | 435 | 435 | **정확히 일치** |
| C | 용량 | 187 MB | 186.81 MB | **일치** |
| C | 파일 수 | 13,754 | 13,755 | **일치** |
| C | react-icons | 85 MB | 84.19 MB | 일치 |
| C | @google/genai | 17 MB | 16.55 MB | 일치 |
| C | react-dom | 8 MB | 6.98 MB | 근사 |
| C | recharts | 10 MB | 6.99 MB | **차이** |
| C | zod | 7 MB | 4.35 MB | **차이** |
| A | index 내 zod | 122 KB | 121.8 KB | **정확히 일치** |
| A | index raw / gzip | 392.2 / 119.7 KB | 355.7 / 108.2 KB | 약 9 % 낮음 |
| A | record raw / gzip | 355.3 / 103.1 KB | 347.0 / 99.8 KB | 근사 |
| B | main.js raw | 3.08 MB | 2.94 MB | 약 5 % 낮음 |
| B | minify 상태 | 미적용 | 미적용 | 일치 |

**C 계층은 사실상 완전히 재현된다.** A·B 는 5~9 % 낮게 나온다. 발표자료에 커밋 해시가 없어 이 차이가 측정 오차인지 그 사이의 코드 변경인지 **구분할 수 없다** — 정정 7이 지적한 문제가 그대로 드러난 지점이다. 앞으로는 이 문서의 `4ebbf85` 기준선을 쓴다.

`recharts`·`zod` 의 차이는 전이 의존성 포함 여부로 보인다(이 하네스는 중첩 `node_modules` 를 건너뛴다). 발표자료 쪽 집계 방식이 남아있지 않아 확정할 수 없다.

### 데드코드 확증

빌드 모듈 그래프(972 모듈) 조회 결과 — 정정 3·4·8의 근거다.

| 대상 | 그래프 내 모듈 수 | 결론 |
| --- | --- | --- |
| `components/statics-section.tsx` | **0** | 데드코드 (정정 3) |
| `@uiw/*` | **0** | 데드 의존성 (정정 4) |
| `app/**` | **0** | 모듈 그래프 밖 (정정 8) |
| `components/my-stats-page.tsx` | 1 | 살아있음 |
| recharts | 251 | 살아있음 (record 청크) |
| zod | 79 | 살아있음 (index 청크 — 정정 2) |

`@uiw/*` 는 그래프에 0개이면서 프로덕션 의존성 트리에는 **22개 패키지**로 존재한다. A 에는 영향이 없고 C 에만 얹혀 있다는 정정 4의 근거다.

---

## 발표자료 정정

발표자료의 **측정 체계와 BEFORE 수치 자체는 유효하다.** 아래는 그 위에 얹힌 개선 처방과 일부 귀속의 오류다. 정정의 성격은 세 가지다.

- ① **이미 완료된 항목을 미완료로 적음** → 정정 1, 3, 4
- ② **처방이 원리적으로 작동하지 않음** → 정정 2
- ③ **미검증 전제를 확정 수치로 적음** → 정정 5, 6, 7

기준: 2026-08-27, `main` @ `01d0664`.

### 정정 1 · "라우트 6개 lazy() 도입" — 이미 되어 있다 (①)

발표자료 슬라이드 18 개선안 2. 총 **13개**가 이미 적용되어 있다.

- `src/App.tsx:27-34` — Home, SignIn, SignUp, Record, Statistics, ThemeSetting, Distraction, Download (8개)
- `components/window.tsx:26-30` — CameraView, YouTubePlayer, WindowShare, Todos, Timer (5개)

도입할 것이 없으므로 "1일" 공수와 기대 효과가 성립하지 않는다. 더 중요한 것은 **index 청크의 zod 가 lazy 라우트 부재 때문이 아니라는 점**이다 → 정정 2.

### 정정 2 · "zod 122 KB → 12곳을 `import type` 으로" — 작동하지 않는다 (②)

발표자료 슬라이드 16. 이 처방은 원리적으로 효과가 없다.

`types/ai-actions.ts` 가 내보내는 것 중 아래는 **런타임 값**이다. `import type` 은 타입 임포트만 지우므로 이 값들은 그대로 남는다.

- `aiActionSchema` — 43행, `z.discriminatedUnion`
- `aiActionBatchSchema` — 89행, `z.array`

`utils/ai-action-validate.ts:1-5` 가 `aiActionBatchSchema` 를 **값으로** 가져온다. 다른 파일을 몇 곳 바꾸든 zod 는 번들에 남는다.

"12곳" 숫자도 맞지 않는다. 실제 임포터는 **14곳**이고 그중 **8곳은 이미 `import type`** 이다.

| 분류 | 개수 | 파일 |
| --- | --- | --- |
| 이미 `import type` | 8 | `apis/services/ai-services/service.ts`, `components/ai/command-palette.tsx`, `components/onboarding/first-run-modal.tsx`, `utils/ai-action-describe.ts`, `utils/ai-action-plan.ts`, `utils/ai-action-plan.test.ts`, `utils/ai-fallback.ts`, `utils/onboarding-windows.ts` |
| zod 스키마를 값으로 | 4 | `utils/ai-action-validate.ts`, `server/ai-interpret.ts`, `server/gemini-schema.test.ts`, `types/ai-actions.test.ts` |
| `AI_WIDGETS` 만 (zod 무관 const) | 2 | `server/ai-prompt.ts`, `server/onboarding-chat.ts` |

바꿀 것이 남아있지 않다. 그리고 **렌더러 그래프에 닿는 zod 값 임포터는 `utils/ai-action-validate.ts` 단 하나다** — `server/**` 는 Vite `ssrLoadModule` 과 `api/**`(Vercel) 로 로드되어 클라이언트 번들에 들어가지 않는다.

**실제 원인 — 정적 임포트 두 줄:**

```
src/App.tsx:19  import AiActionRunner from "@/components/ai/ai-action-runner"   ← 정적
src/App.tsx:20  import CommandPalette  from "@/components/ai/command-palette"   ← 정적
      └→ ai-action-runner.tsx:6 / command-palette.tsx:6
             import { validateAiActions } from "@/utils/ai-action-validate"
         └→ utils/ai-action-validate.ts:1-5   import { aiActionBatchSchema }   ← 런타임 값
             └→ types/ai-actions.ts:1         import { z } from "zod"
```

`pages/home.tsx:3` → `first-run-modal` 도 같은 곳에 닿지만 `HomePage` 가 lazy(`src/App.tsx:27`) 라 무해하다.

**원인은 `App.tsx:19-20` 두 줄뿐이다.** 같은 파일 27-34행 패턴으로 lazy 화하면 된다 — 1일이 아니라 수분짜리 변경이다. 두 컴포넌트 모두 `<Suspense>`(`src/App.tsx:103`) 밖에 렌더되므로 경계 위치만 확인하면 된다.

발표자료의 `zod/mini` 제안: 모듈이 정적 그래프에 남아있는 한 **줄이는 효과일 뿐 제거가 아니다.** 또한 zod v4 `zod/mini` 에서 `discriminatedUnion`·`strictObject` 의 API 호환 여부는 확인되지 않았다.

### 정정 3 · recharts 사용처는 1곳이 아니라 2곳이다 (①)

발표자료 슬라이드 17은 `components/my-stats-page.tsx` 한 곳으로 적었다. 실제 임포터는 2곳이다.

- `components/my-stats-page.tsx:3-11` — BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell (**7개** — 발표자료의 "API 7개"와 일치)
- `components/statics-section.tsx:9-15` — BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip (6개)

단 **`components/statics-section.tsx` 는 임포터가 0개인 데드코드다.** 번들 수치(record 청크 355.3 KB)는 영향받지 않지만, 발표자료대로 작업하는 사람이 grep 하면 2곳이 나와 데드 파일을 고치는 헛수고를 한다. `app/(auth)/my-page/record/page.tsx:1` 도 `my-stats-page` 를 임포트해 오탐을 하나 더 만든다 → 정정 8.

recharts 가 **record 청크에 있다는 귀속은 맞다**: `my-stats-page` ← `pages/my-page/record.tsx:1` ← `src/App.tsx:30` (lazy).

### 정정 4 · `@uiw/react-color` 는 이미 데드다 (①)

발표자료 슬라이드 18 개선안 3("946 KB → 0"). 방향은 맞고 서술이 틀리다.

TS/TSX 임포트가 **0곳**이다. `package.json` dependencies, `README.md`, `.vercel/node/package-manifest.json` 에만 남아 있다. 컴포넌트 교체 작업이 아니라 **의존성 한 줄 삭제**다.

그리고 **A 계층에는 효과가 없다.** 이미 모듈 그래프 밖이라 Vite 가 트리셰이킹한 상태다. 946 KB 는 `node_modules` 디스크 크기(C 계층)이지 번들 절감분(A 계층)이 아니다.

### 정정 5 · "deps 187→47 MB, 인스톨러 −140 MB" — 미검증 전제 (③)

발표자료 슬라이드 14 · 18(개선안 4) · 19.

논리는 `build.files` 화이트리스트가 `node_modules` 를 배제한다는 것인데, **electron-builder 는 프로덕션 의존성을 `files` 와 별개 규칙으로 다룬다.** 두 갈래로 결론이 정반대가 된다.

- **이미 배제돼 있다면** → −140 MB 절감은 **존재하지 않는다.** C 는 인스톨러 비용이 아니라 CI/`npm install` 비용이다.
- **포함돼 있다면** → 절감은 실재하나 아래 제약이 붙는다.

판정은 한 줄이다.

```bash
npx @electron/asar list <unpacked>/resources/app.asar | grep node_modules
```

**이 수치를 다시 인용하기 전에 위 명령으로 실측해야 한다.**

**발표자료가 빠뜨린 제약:** `scripts/build-electron.js:55-61` 이 `get-windows`·`electron-store`·`conf` 를 esbuild **external** 로 둔다. 번들에 없으므로 런타임에 `node_modules` 에 반드시 존재해야 한다 — `package.json` `asarUnpack` 에 `node_modules/get-windows/**/*` 가 이미 잡혀 있는 이유다. `ignoredProductionDependencies` 목록에서 이 3개와 전이 의존성이 빠지면 **패키징된 앱이 `MODULE_NOT_FOUND` 로 죽는다.** 슬라이드 19는 이 리스크를 언급하되 어느 모듈인지 특정하지 않는다. dev 에서는 재현되지 않고 패키징 후에만 드러나는 실패다.

### 정정 6 · AFTER 목표 표의 전제 (③)

발표자료 슬라이드 19.

- "A index 392.2 KB → zod 제거" — 목표는 유효하나 도달 경로가 정정 2로 바뀐다.
- "C deps 187 → 47 MB", "D 233.7 → 222 MB" — 정정 5의 미검증 전제를 물려받는다. **목표가 아니라 보류 항목으로 다뤄야 한다.**

### 정정 7 · 측정 기준에 커밋 해시가 없다 (③)

발표자료는 "2026-08-26 · `main` · v1.2.0" 만 적었다. 그런데 슬라이드 7이 스스로 1번 원칙으로 `git rev-parse HEAD` 를 요구한다. **정작 해시가 없어 재현이 불가능하다.**

이 문제는 이미 현실화됐다. 하루 뒤(2026-08-27) 트리에는 lazy 라우트 13개가 있고 `@uiw/react-color` 는 데드다 — 발표자료가 "앞으로 할 일"로 적은 항목들이다. 어느 커밋에서 잰 것인지 없으면 정정 1·4 같은 불일치가 발표자료의 오류인지 이후 변경인지 구분할 수 없다.

**모든 BEFORE 수치에는 날짜가 아니라 커밋 해시를 박는다.**

### 정정 8 · 발표자료에 없는 항목 — `app/**` Next.js 잔재

파일 6개: `app/page.tsx`, `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/page.tsx`, `app/(auth)/my-page/record/page.tsx`, `app/(auth)/my-page/record/loading.tsx`, `app/(auth)/my-page/statistics/loading.tsx`.

Vite 엔트리는 `index.html` → `/src/main.tsx` 이고 라우팅은 react-router + `pages/` 다. 따라서 `app/**` 은 **모듈 그래프 밖(번들 영향 0)** 이다. 그러나

- `tsconfig.json` `include: ["**/*.ts", "**/*.tsx"]` 에 걸려 **type-check 대상**이고,
- `lint` 스크립트 대상(`src components apis stores hooks utils types server api`)에서는 **빠져 있다.**

`npm run check` 의 순수 부하이며 정정 3의 grep 오탐 원인이다.

---

## 검증 범위

| 정정 | 근거 | 상태 |
| --- | --- | --- |
| 1 lazy 13개 이미 적용 | `src/App.tsx:27-34`, `components/window.tsx:26-30` | **확정** |
| 2 `import type` 처방 무효 | 임포터 14곳 분류 + 빌드 그래프에 zod 79 모듈 · index 청크 121.8 KB | **확정** |
| 3 recharts 2곳 · 1곳은 데드 | 빌드 그래프 `statics-section` 0 모듈 | **확정** |
| 4 `@uiw` 이미 데드 | 빌드 그래프 0 모듈 · 프로덕션 트리 22 패키지 | **확정** |
| 5 deps 정리 전제 | asar 게이트 — `node_modules` 10,607 항목 실림 | **확정 (전제가 틀렸음)** |
| 6 AFTER 목표 전제 | 정정 5에 종속 | **확정** |
| 7 커밋 해시 부재 | A·B 가 5~9 % 어긋나는데 원인 구분 불가 | **확정 (현실화됨)** |
| 8 `app/**` 잔재 | 빌드 그래프 0 모듈 · `tsconfig.json` include 대상 | **확정** |

**재측정하지 않은 것**: 인스톨러 다운로드 크기(발표자료 Windows NSIS 233.7 MB / macOS DMG 269.9 MB, HTTP `Content-Length`)와 Electron 43 런타임 143.2 MB. D 계층은 `app.asar` 과 unpacked 까지만 실측했다. macOS 쪽은 이 환경(win32-x64)에서 측정할 수 없다.

**정적 분석에 머무는 것**: "프로덕션 413개는 빌드 타임 전용" — 패키징된 앱을 실행해 확인해야 확정된다.
