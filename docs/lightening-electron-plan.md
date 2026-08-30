# Electron 데스크탑 앱 경량화 계획

> 원인 근거: `docs/lightening-electron-analysis.md`. 이 문서는 "무엇을, 어떤 순서로, 어떻게 재보고, 언제 취소하는가"만 다룬다.
> 원칙: **자동화된 전/후 측정으로 판정한다. 눈대중 금지.** 매 스텝 `perf:electron:before → 변경 → perf:electron:after → perf:electron:diff`. 취소 조건 발동 시 즉시 리버트.
> 판정 원천: `scripts/perf-measure-electron.mjs` 실측. `1 MB = 1024×1024 bytes`.

---

## 0. 판정 지표 (Success Criteria)

| ID | 지표 | 측정 원천 | 취득 방법 |
|---|---|---|---|
| E1 | `.app` 총합 (bytes) | `release/mac-arm64/외요의 캠스터디.app` | 재귀 스캔 (스크립트 `dirSize`) |
| E2 | `app.asar` (bytes) | `.app/Contents/Resources/app.asar` | `fs.statSync` |
| E3 | `app.asar.unpacked` (bytes) | `.app/Contents/Resources/app.asar.unpacked/` | 재귀 스캔 |
| E4 | `Contents/Frameworks` (bytes) | 위 폴더 | 재귀 스캔 |
| E5 | 로케일 `.lproj` 합계 (bytes) | Electron Framework Resources | 재귀 스캔 |
| E6 | asar 내부 dep top 15 | asar 추출 후 `node_modules/*` | @electron/asar CLI로 임시 추출 → 크기 산출 |
| E7 | 콘솔/pageerror (참고) | 웹 세션의 `perf:bundle` 결과 | 회귀 감시 |

**주요 판정**은 E1, E2, E3. **회귀 임계값**: 각 지표 +5% 이상 시 diff exit 1.

---

## 1. 측정 파이프라인 (사람 손 0)

### 스크립트: `scripts/perf-measure-electron.mjs`

명령:

```bash
npm run perf:electron:before   # 변경 전 스냅샷
npm run perf:electron:after    # 변경 후 스냅샷
npm run perf:electron:diff     # 두 스냅샷 비교
```

동작:

1. **정리**: `dist/`, `dist-electron/`, `release/` 삭제.
2. **빌드**: `npm run build:ts` → `npm run build:web`.
3. **패키징**: `npx electron-builder --dir --mac -c.mac.identity=null -c.directories.output=release`. 서명 없이 앱 폴더만 (dmg/zip 스킵 → 훨씬 빠름).
4. **스캔**:
   - `.app` 재귀 스캔 → E1
   - `app.asar` 크기 → E2
   - `app.asar.unpacked/` 재귀 → E3
   - `Contents/Frameworks` 재귀 → E4
   - Electron Framework Resources 안 `.lproj` 목록 → E5
5. **asar 내부 스캔**: `@electron/asar` CLI로 임시 폴더에 추출 → 최상위 폴더별·`node_modules/*`별 크기 계산 → `asar-contents.json` 저장.
6. **결과**: `perf-out/electron/<label>/{summary.md, electron.json, asar-contents.json}`.
7. **diff**: 두 스냅샷을 비교해 표 리포트 + 임계값 판정.

Node 20.19+ / 22.12+ 필요 (electron-builder 26 요구).

---

## 2. 작업 로드맵

각 스텝은 독립 PR. 앞선 스텝과 무관하게 롤백 가능.

### Step E1 — `files` whitelist로 asar 내 node_modules 대폭 감축

- 근거: `analysis §2` — main 프로세스는 runtime에 `electron-store`, `conf`, `get-windows` 만 필요. 나머지 152 MB는 편승.
- 조작: `package.json.build.files` 를 다음과 같이 변경.
  ```json
  "files": [
    "package.json",
    "dist-electron/**/*",
    "dist/**/*",
    "!node_modules/**",
    "node_modules/electron-store/**",
    "node_modules/conf/**",
    "node_modules/get-windows/**"
  ]
  ```
  electron-builder는 필요한 transitive를 자동으로 함께 담는다(ajv, js-yaml 등이 conf 사슬에서 자동 포함).
- 검증: after 스냅샷의 `asar-contents.json` 에서 `react-icons`, `@google/genai`, `recharts`, `zod`, `@reduxjs/toolkit`, `es-toolkit`, `web-streams-polyfill`, `protobufjs`, `react-router`, `react-dom`, `@tanstack/query-core`, `axios` 가 **사라졌는지** 확인.
- 예상: **E2(app.asar) -140~150 MB**, **E1(.app 총합) -140~150 MB**.
- 위험: main 프로세스가 실제로 참조하는 native/external을 놓치면 런타임 크래시. 사전에 esbuild `external` 목록(`scripts/build-electron.js:55-61`)과 대조.
- 취소 조건: E1이 감소하지 않거나, 스모크 테스트에서 앱이 안 뜨면 즉시 리버트.

### Step E2 — `electronLanguages` 로 로케일 제한

- 근거: `analysis §6` — 220개 언어 중 필요한 것은 소수.
- 조작: `package.json.build` 에 다음 추가.
  ```json
  "electronLanguages": ["ko", "en", "en-US"]
  ```
- 예상: **E5(로케일 lproj) 46 MB → ~1 MB** (-45 MB). E4(Frameworks)에도 반영.
- 위험: 사용자 시스템 언어가 위 목록 밖이면 폴백 처리(Electron 자체가 en 폴백). 실사용자 대부분 한국어/영어.
- 취소 조건: 앱 실행 시 문자열 렌더링 이슈, 콘솔 warning 폭증.

### Step E3 — `@google/genai` 를 `devDependencies` 로 이동

- 근거: `analysis §4` — 배포된 데스크탑 앱은 SDK를 안 씀. Vercel 서버(`api/`)와 vite dev 미들웨어만 씀.
- 조작:
  1. `package.json` 에서 `@google/genai` 를 `dependencies` → `devDependencies` 이동.
  2. Vercel 배포에서는 devDependencies도 함께 설치되므로 서버리스 함수 빌드 문제 없음(`.vercelignore` / `scripts/vercel-install.js` 확인).
  3. 개발/서버 코드가 정상 동작하는지 스모크: `npm run dev`, `npm run type-check`.
- 예상: Step E1이 이미 적용됐다면 이 변경은 asar 크기에 영향 없음(어차피 whitelist에서 빠져 있음). **Step E1 없이 단독 적용 시** E2 -25 MB (genai 14 + web-streams-polyfill 8.5 + protobufjs 2.8).
- 위험: Vercel 배포 실패 가능성. CI에서 배포 preview로 검증 필요.
- 취소 조건: `npm run build:web` 실패, Vercel preview 실패.

### Step E4 — `asarUnpack: ["dist/**/*"]` 제거

- 근거: `analysis §7`. 웹 세션 분석 §7과 동일.
- 조작: `package.json.build.asarUnpack` 에서 `"dist/**/*"` 제거. `"node_modules/get-windows/**/*"` 는 유지 (native 로더).
- 예상: E1 -5~15 MB (asar 압축 이득).
- 위험: `src-electron/main.ts` 의 `loadFile` 경로 확인 필요. Electron은 asar 안 파일도 file:// 로 로드 가능.
- 취소 조건: 스모크 앱 실행 실패, 웹뷰 로딩 실패.

### Step E5 (선택) — recharts 3.x → 2.x 다운그레이드 스파이크

- 근거: `analysis §5` — recharts 3.x가 redux-toolkit + es-toolkit 8 MB를 딸려옴.
- 조작: `package.json` 에서 `recharts` 를 2.x LTS로 다운그레이드. `components/my-stats-page.tsx`, `components/statics-section.tsx` 의 API 호환성 검증.
- 예상: E2 -8 MB (+ 웹 번들 record 청크도 감량 가능성).
- 위험: 차트 렌더링 회귀. Playwright 스모크 필요.
- 유보: Step E1 적용 후 recharts는 이미 asar에서 빠지므로 이 스텝은 옵션.

### Step E6 (선택) — 웹 세션 남은 이슈 병행

- Step E1이 성공하면 웹 번들 세션의 미착수 Step 4(Plan B: recharts dynamic import)는 asar 관점에서 의의가 사라짐. 웹 초기 로딩 관점에서만 별도 스파이크.

---

## 3. 목표 (총합)

| 항목 | Baseline | Step E1~E4 목표 | Δ |
|---|---|---|---|
| .app 총합 | 443.4 MB | ≤ 260 MB | **-183 MB (-41%)** |
| app.asar | 167.0 MB | ≤ 20 MB | **-147 MB (-88%)** |
| Frameworks (로케일 감소 반영) | 274.2 MB | ≤ 230 MB | -44 MB |
| 로케일 lproj 합계 | 46.4 MB | ≤ 2 MB | -44 MB |

목표치는 §2 각 스텝의 감량 하한 합산. 실측이 하한에 미달하면 개별 스텝 취소 후 다음 스텝으로.

---

## 3-a. 실행 결과 (Step E1 + E2 + E3 완료, E4 유보)

**원본 baseline → 최종 실측:**

| 지표 | 원본 | 최종 | Δ | 목표 대비 |
|---|---|---|---|---|
| .app 총합 | 443.47 MB | **248.61 MB** | **-43.9% (-195 MB)** | 목표 ≤260 MB **초과 달성** |
| app.asar | 167.00 MB | **17.45 MB** | **-89.6% (-150 MB)** | 목표 ≤20 MB **달성** |
| Frameworks | 274.23 MB | 228.97 MB | -16.5% (-45 MB) | 목표 ≤230 MB **달성** |
| 로케일 lproj | 46.39 MB | 1.19 MB | -97.4% (-45 MB) | 목표 ≤2 MB **달성** |

**스모크 검증**: 각 스텝 뒤 앱 실행 15초 유지 + 창 3개 자식 프로세스(renderer, gpu, utility) 확인. 로그에서 `창 생성 실패`, `Express 서버 시작 실패`, `ERR_FAILED` 부재 확인. Auto-updater `app-update.yml` 부재 경고는 서명 없는 로컬 실행 특성 — 정상.

**스텝별 결과:**

| Step | 조작 | 결과 | 판정 |
|---|---|---|---|
| E1 v1 (취소) | `!node_modules/**` + 3개 whitelist | asar -98% 감량은 됐으나 conf transitive(ajv 등) 부재로 런타임 크래시 위험 → 리버트 | 취소 |
| E1 v2 (취소) | negative 패턴(`!node_modules/react-icons` 등) | asar -85% 감량됐으나 `dist/**/*` unpacked 규칙과 상호작용해 렌더러 로드 실패 → 리버트 | 취소 |
| **E1 v3** | 렌더러 전용 15개 dependency를 **`devDependencies`로 이동**. main 프로세스가 실제 참조하는 것만 dependencies 유지 (`axios`, `electron-store`, `electron-updater`, `express`, `get-windows`, `http-proxy-middleware`, `qs`). electron-builder는 devDependencies를 자동 제외 | **.app -29.3%, asar -87.5%**, react-icons/recharts/redux-toolkit/es-toolkit/zod/react-router/react-dom/tanstack/immer 100% 제거. 스모크 15초 통과 | ✓ |
| **E2** | `electronLanguages: ["ko","en","en-US"]` 추가 | **.app -15.4%**, lproj 220개 → 2개. Frameworks 274 → 229 MB. 스모크 15초 통과 | ✓ |
| **E3** | `@google/genai` → devDependencies (E1 v3에 앞서 소규모 검증으로 진행) | **.app -6.2%, asar -16.5%**. genai + web-streams-polyfill + protobufjs 100% 제거. 스모크 통과 | ✓ |
| E4 (유보) | `asarUnpack: ["dist/**/*"]` 제거 | `main.ts:388-392`가 `app.asar.unpacked/dist`를 참조 + `express.static`은 asar 내부 파일 서빙 불가 → 리팩터 규모 크므로 §6 남은 이슈 | 유보 |

**초과 달성 이유**: 계획 §3 목표는 각 스텝 감량 하한 합산(≤260 MB, -41%)이었으나, 실제로는 `devDependencies` 이동이 명시적으로 계획한 것보다 넓은 범위를 잡아 목표를 초과했다. 특히 web-streams-polyfill/protobufjs/immer/react-redux 같은 transitive들도 자동으로 함께 제거됐다.

---

## 4. 취소 조건 (언제 롤백하나)

각 스텝은 다음 조건 중 하나라도 걸리면 즉시 리버트:

1. **주요 판정 지표 개선 없음/회귀**: E1/E2/E3 중 어느 하나라도 개선 0 또는 +5% 이상 회귀.
2. **런타임 크래시**: 패키징된 앱을 열었을 때 즉시 크래시하거나 로그에 module not found.
3. **콘솔/pageerror 폭증**: 웹 세션 `perf:bundle:after`로 콘솔 회귀 감시.
4. **CI/배포 실패**: Vercel preview, `npm run check` 실패.

취소된 스텝은 원인 재조사 후 별도 이슈로. "다시 시도"는 다음 PR.

---

## 5. 산출물 위치

- 원인 문서: `docs/lightening-electron-analysis.md`
- 이 계획: `docs/lightening-electron-plan.md`
- 측정 스크립트: `scripts/perf-measure-electron.mjs` (구현 완료)
- 스냅샷/리포트: `perf-out/electron/{before,after}/`, `perf-out/electron/diff.md`
- npm 스크립트: `perf:electron:before` / `perf:electron:after` / `perf:electron:diff` (`package.json` 에 이미 추가됨)
- CI 훅: 별도 PR (`.github/workflows/perf-electron.yml`) — Node 20.19+ 러너

웹 번들 계획서(`docs/lightening-plan.md`)와는 관심사가 다르므로 분리. 두 파이프라인은 독립적으로 굴린다.

---

## 6. 남은 이슈 (별도 스파이크)

**Step E4 — asarUnpack 최소화.**

`package.json:100-103`의 `asarUnpack: ["dist/**/*", "node_modules/get-windows/**/*"]` 에서 `dist/**/*` 만 제거하는 게 목표. asar 압축 이득 -5~15 MB 예상.

- 블로커 1: `src-electron/main.ts:388-392` — `staticDir = path.join(process.resourcesPath, "app.asar.unpacked", "dist")` 를 참조. dist가 asar 안으로 들어가면 이 경로 없음.
- 블로커 2: `src-electron/express-server.ts:24` — `app.use(express.static(staticDir))`. **express.static은 asar 내부 파일을 서빙할 수 없다** (fs.stat/open은 asar 프로토콜 지원 안 함).

가능한 방향:
1. Electron `protocol.registerFileProtocol` 로 `app://` 스킴을 만들고 렌더러가 그 URL로 로드. Express 서버 자체 제거 가능.
2. `express.static` 대신 asar 내부 로더를 구현 (fs.readFileSync는 asar 지원함).
3. 유지: 감량 폭 대비 리팩터 비용 크므로 유보.

`Step E4 (선택) — recharts 3.x → 2.x 다운그레이드`도 Step E1 적용 후 asar에서 이미 recharts가 빠졌으므로 데스크탑 앱 관점에서 의의가 사라짐. 웹 번들 관점의 별도 스파이크(`docs/lightening-plan.md §6`)로.

---

## 7. 향후 관측용 CI 훅

- GitHub Actions에서 PR마다 `perf:electron:before`(base) / `perf:electron:after`(PR) / `perf:electron:diff`.
- Node 20.19+ 러너, macOS runner (electron-builder --dir --mac 요구).
- diff exit 1 → PR 실패 + 코멘트 게시.
- 별도 PR로 `.github/workflows/perf-electron.yml` 추가.
