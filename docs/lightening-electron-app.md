# Electron 데스크탑 앱 경량화 (전체 기록)

> 사용자가 GitHub Releases 에서 다운받는 `외요의 캠스터디.app`(dmg/zip)을 줄인 세션의 전체 기록. 원인 · 계획 · 실행 결과 · 남은 이슈까지 이 한 문서에 담는다.
> 스코프: macOS `.app` 산출물(`release/mac-arm64/외요의 캠스터디.app`). Windows/Linux 도 동일 규칙 적용.
> 판정 원천: `scripts/perf-measure-electron.mjs` 실측 + [v1.3.0 릴리즈 dmg 실측치](https://github.com/sabit1997/cam-study/releases/tag/v1.3.0). `1 MB = 1024 × 1024 bytes`.

---

## 0. 결과 요약 (Baseline → 최종)

**--dir 실측 (앱 폴더, 압축 전):**

| 지표 | 원본 | 최종 | Δ |
|---|---|---|---|
| **.app 총합** | 443.47 MB | **248.61 MB** | **-43.9% (-195 MB)** |
| **app.asar** | 167.00 MB | **17.45 MB** | **-89.6% (-150 MB)** |
| Frameworks | 274.23 MB | 228.97 MB | -16.5% (-45 MB) |
| 로케일 lproj (220개 → 2개) | 46.39 MB | 1.19 MB | -97.4% (-45 MB) |

**실제 사용자 다운로드 (dmg, 압축 후):**

| Release | dmg 크기 | Δ |
|---|---|---|
| v1.2.0 | 670 MB | — |
| **v1.3.0** | **107 MB** | **-84% (-563 MB)** |

**한 줄 요약**: 사용자가 다운받는 dmg 가 **670 → 107 MB**. 설치 후 앱 크기도 **443 → 249 MB**. 스모크 15초 유지 + 렌더러 로드 정상 검증.

---

## 1. 원인 분석

### 1.1 지표 요약 (Baseline)

`npm run perf:electron:before` 실측치 (`perf-out/electron/before/summary.md`).

| 항목 | 크기 | 비율 |
|---|---|---|
| **.app 총합** | **443.43 MB** | 100% |
| ├ Contents/Frameworks (Electron 런타임 + 로케일) | 274.24 MB | 62% |
| │  └ 로케일 `.lproj` 220개 | 46.39 MB | 10% |
| │  └ 로케일 `.pak` 3개 | 7.11 MB | 2% |
| ├ **app.asar** (앱 코드 + node_modules) | **166.99 MB** | **38%** |
| │  └ node_modules | **162.01 MB** | 37% |
| │  └ dist-electron (main/preload 번들) | 2.94 MB | <1% |
| │  └ dist (웹 번들) | 1.25 MB | <1% |
| └ app.asar.unpacked (get-windows native) | 1.53 MB | <1% |

**한 줄 요약**: 274 MB 는 Electron 런타임(줄이기 어려움), **167 MB 의 `app.asar` 가 통제 가능한 감량 대상**이며 그 중 **162 MB 가 node_modules**다.

### 1.2 app.asar 안 node_modules 상위 15개

| 패키지 | 크기 | 참여 사슬 |
|---|---|---|
| **react-icons** | **81.90 MB** | `dependencies` 직접 지정 |
| **@google/genai** | **14.24 MB** | `dependencies` 직접 지정 (원래 서버용) |
| web-streams-polyfill | 8.54 MB | `@google/genai` → google-auth-library → gaxios → node-fetch → fetch-blob |
| react-dom | 6.98 MB | 필수 |
| recharts | 6.32 MB | `dependencies` 직접 지정 |
| **@reduxjs/toolkit** | **5.43 MB** | **`recharts@3.9.2` → transitive** (3.x부터 신규 편입) |
| zod | 4.03 MB | `dependencies` 직접 지정 |
| react-router | 3.66 MB | `react-router-dom` 하위 |
| protobufjs | 2.77 MB | `@google/genai` → transitive |
| **es-toolkit** | **2.62 MB** | **`recharts@3.9.2` → transitive** |
| @tanstack/query-core | 1.98 MB | `@tanstack/react-query` 하위 |
| **node-gyp** | **1.73 MB** | `@electron/rebuild`(devDep) + `get-windows` — runtime 불필요 |
| axios | 1.49 MB | dev 프록시 서버가 씀 |
| js-yaml | 0.90 MB | `electron-store` 사슬 (필요) |
| ajv | 0.90 MB | `electron-store` 사슬 (필요) |

### 1.3 결정적 인사이트 — main 프로세스는 사실상 node_modules 를 안 쓴다

**증거.**

`scripts/build-electron.js:55-61` — esbuild 가 main 프로세스를 번들할 때 **external 로 남기는 것은 5개뿐**:

```
external: ["electron", "fsevents", "get-windows", "electron-store", "conf"]
```

`src-electron/**/*.ts` 가 import 하는 것 (`grep`으로 추적):

```
axios, child_process, crypto, electron, electron-updater, express, fs,
http-proxy-middleware, net, os, path, vitest (테스트만)
```

이 중 external 5개(`electron`, `fsevents`, `get-windows`, `electron-store`, `conf`)를 뺀 나머지 — `axios`, `electron-updater`, `express`, `http-proxy-middleware` — 는 **esbuild 가 `dist-electron/main.js`(3.1 MB)에 모두 번들**한다. `grep -oE "electron-updater" dist-electron/main.js | wc -l` → 156회 등장으로 실측 확인.

**따라서 runtime 에 `node_modules/` 에서 실제 로드되는 것은 3개**:
- `electron-store` (1.1 MB)
- `conf` (2.4 MB, electron-store 하위)
- `get-windows` (6.2 MB, native — `asarUnpack` 대상)

**총 ~10 MB.** 나머지 **~152 MB 는 electron-builder 가 `dependencies` 폴더 전체를 무지성으로 asar 에 담은 결과**다.

### 1.4 웹 번들 tree-shaking 과 electron-builder 는 별개다

웹 번들에서 `react-icons` 는 subpath import(`react-icons/fi/FiCheck` 등)만 써서 실제 청크에는 아이콘 몇 개만 실린다 (웹 번들 `fi-*.js` 6.6 KB). 그런데 asar 에는 **`node_modules/react-icons/` 폴더 전체 81.9 MB 가 통째로** 실린다.

이유: electron-builder 는 `package.json` 의 `dependencies` 목록을 훑어 각 폴더를 통째로 복사한다. **소스가 어떤 subpath 만 참조하는지 모른다.**

같은 이유로:
- `zod` 4 MB — 웹 번들엔 lazy 청크로 격리 완료 ([웹 세션 Step 2](./lightening-web-bundle.md#step-2)), asar 엔 전체
- `recharts` 6.3 MB — 웹 번들 lazy, asar 전체 (+ transitive 8 MB)
- `@google/genai` 14.2 MB — 웹 번들엔 애초에 없음(서버 전용), asar 에는 전체 + web-streams-polyfill 8.5 MB + protobufjs 2.8 MB

**이건 electron-builder 의 태생적 특성.** `files` 필터로 명시 제외해야 한다.

### 1.5 `@google/genai` 사슬은 렌더러 무관 — 25 MB 편승

- `dependencies` 목록에 있음. 렌더러(웹)는 `/api/ai-*` 프록시만 호출, SDK 직접 사용 안 함.
- Main 프로세스도 SDK 직접 사용 안 함 — express 프록시가 Vercel 로 릴레이.
- **개발 환경에서 Vite dev 미들웨어(`vite.config.mts`)와 서버리스 함수(`api/ai-interpret.ts`) 가 `server/ai-interpret.ts` 를 통해 SDK 를 씀.** 배포된 데스크탑 앱에는 이 코드 경로가 없음.

**결론**: dev/server 전용. `devDependencies` 로 옮기거나 files 필터로 asar 에서 제외 가능. 감량 25 MB.

### 1.6 recharts 3.x transitive — redux-toolkit + es-toolkit

- `recharts@3.9.2` 는 내부 상태 관리를 위해 `@reduxjs/toolkit`(5.4 MB), 유틸을 위해 `es-toolkit`(2.6 MB) 을 씀. 2.x 에는 없던 신규 dep.
- 웹 번들에는 tree-shaking 되지만 asar 에는 두 폴더 전체 편입 → +8 MB.
- 감량 옵션: (a) files 필터 or devDep 이동으로 asar 제외 (안전), (b) recharts 2.x 다운그레이드, (c) 차트 라이브러리 교체.

### 1.7 Electron 로케일 46 MB × 220개

`Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/*.lproj` 220개 폴더. top 8:

| 폴더 | 크기 |
|---|---|
| ml.lproj (말라얄람) | 1.62 MB |
| ta.lproj (타밀) | 1.61 MB |
| kn.lproj (칸나다) | 1.58 MB |
| te.lproj (텔루구) | 1.49 MB |
| hi.lproj (힌디) | 1.45 MB |
| bn.lproj (벵골) | 1.39 MB |
| gu.lproj (구자라트) | 1.37 MB |
| mr.lproj (마라티) | 1.34 MB |

**한국어 앱**인데 220개 언어 리소스가 전부 딸려온다. `electron-builder` 의 `electronLanguages` 설정으로 필요한 것만 유지 가능.

### 1.8 `asarUnpack: ["dist/**/*", ...]` — 웹 자산이 asar 밖에

`package.json:97-100` 참조. 결과: 웹 번들(`dist/`) 이 압축 없이 파일 시스템에 개별 파일로 풀림. asar 안으로 들여보내면 압축 이득 + 파일 개수 감소. 다만 감량 폭 상대적으로 작음(~5–15 MB). 위 스텝들이 훨씬 큼.

### 1.9 node-gyp 1.7 MB 편승 (dev 도구가 asar 안에)

- `@electron/rebuild@4.1.0`(devDependency) 와 `get-windows@9.3.0` 하위에 `node-gyp` 두 개.
- 원칙적으로 devDependencies 는 electron-builder 가 자동 제외. asar 안에 있다는 것은 `get-windows` 사슬 쪽 것이 남은 것으로 보임.
- runtime 에 node-gyp 필요 없음.

### 1.10 Frameworks 274 MB (Electron 런타임)

Electron 43 chrome 137. 프레임워크 자체는 줄이기 어렵다. 그나마 감량 가능한 것은 로케일(§1.7).

---

## 2. 판정 지표 (Success Criteria)

| ID | 지표 | 원천 | 취득 방법 |
|---|---|---|---|
| E1 | `.app` 총합 (bytes) | `release/mac-arm64/외요의 캠스터디.app` | 재귀 스캔 |
| E2 | `app.asar` (bytes) | `.app/Contents/Resources/app.asar` | `fs.statSync` |
| E3 | `app.asar.unpacked` (bytes) | `.app/Contents/Resources/app.asar.unpacked/` | 재귀 스캔 |
| E4 | `Contents/Frameworks` (bytes) | 위 폴더 | 재귀 스캔 |
| E5 | 로케일 `.lproj` 합계 (bytes) | Electron Framework Resources | 재귀 스캔 |
| E6 | asar 내부 dep top 15 | asar 추출 후 `node_modules/*` | @electron/asar CLI 로 임시 추출 → 크기 산출 |
| E7 | 스모크: 앱 실행 유지 + 렌더러 로드 | 로컬 실행 | 15초 유지 + 자식 프로세스 3개 확인 + 로그 clean |

**주요 판정**은 E1, E2, E3. **회귀 임계값**: 각 지표 +5% 이상 시 diff exit 1.

---

## 3. 측정 파이프라인 (사람 손 0)

### 3.1 스크립트: `scripts/perf-measure-electron.mjs`

```bash
npm run perf:electron:before
npm run perf:electron:after
npm run perf:electron:diff
```

동작:

1. **정리**: `dist/`, `dist-electron/`, `release/` 삭제.
2. **빌드**: `npm run build:ts` → `npm run build:web`.
3. **패키징**: `npx electron-builder --dir --mac -c.mac.identity=null -c.directories.output=release`. 서명 없이 앱 폴더만 (dmg/zip 스킵 → 훨씬 빠름).
4. **스캔**: `.app` 재귀 → E1, `app.asar` 크기 → E2, `app.asar.unpacked/` 재귀 → E3, `Contents/Frameworks` → E4, Electron Framework Resources 안 `.lproj` → E5.
5. **asar 내부 스캔**: `@electron/asar` CLI 로 임시 폴더에 추출 → 최상위 폴더별·`node_modules/*` 별 크기 계산 → `asar-contents.json`.
6. **결과**: `perf-out/electron/<label>/{summary.md, electron.json, asar-contents.json}`.
7. **diff**: 두 스냅샷 비교 표 리포트 + 임계값 판정.

Node 20.19+ / 22.12+ 필요.

### 3.2 스모크 (수동, 각 스텝 뒤 필수)

```bash
"release/mac-arm64/외요의 캠스터디.app/Contents/MacOS/외요의 캠스터디" > /tmp/electron-run.log 2>&1 &
BINPID=$!
sleep 15
kill -0 $BINPID && echo "PID $BINPID 15초 유지 ✓" && pgrep -P $BINPID  # renderer/gpu/utility 3개
kill $BINPID
grep -iE "창 생성 실패|Express 서버 시작 실패|ERR_FAILED" /tmp/electron-run.log  # 부재해야 함
```

---

## 4. 작업 로드맵 (계획)

각 스텝은 독립 PR. 앞선 스텝과 무관하게 롤백 가능.

### Step E1 — `dependencies` 재구성 (렌더러/dev/서버 전용을 `devDependencies` 로)

- 근거: §1.3 — main 프로세스는 runtime 에 `electron-store`, `conf`, `get-windows` 만 필요. 나머지 152 MB 는 편승.
- 조작: `package.json.dependencies` 를 축소.
  - **유지 (main 프로세스 실참조)**: `axios`, `electron-store`, `electron-updater`, `express`, `get-windows`, `http-proxy-middleware`, `qs`.
  - **devDependencies 이동**: `@google/genai`, `@radix-ui/react-tooltip`, `@tanstack/react-query`, `@uiw/react-color`, `react`, `react-dom`, `react-error-boundary`, `react-icons`, `react-rnd`, `react-router-dom`, `react-youtube`, `recharts`, `sonner`, `use-debounce`, `zod`, `zustand`.
- electron-builder 는 devDependencies 를 자동 제외. transitive(web-streams-polyfill, protobufjs, immer, react-redux 등) 도 자동으로 함께 제거.
- 예상: **E1(.app 총합) -140~150 MB**, **E2(app.asar) -140~150 MB**.
- 위험: Vercel 서버리스 함수(`api/*.ts`)가 `@google/genai` 를 참조. Vercel `npm install` 은 devDep 도 설치하므로 안전 (`scripts/vercel-install.js:23` 확인).
- 취소 조건: 스모크 실패 (Express 서버 미기동, 렌더러 로드 실패).

### Step E2 — `electronLanguages` 로 로케일 제한

- 근거: §1.7.
- 조작: `package.json.build` 에 `"electronLanguages": ["ko", "en", "en-US"]` 추가.
- 예상: **E5(로케일 lproj) 46 MB → ~1 MB** (-45 MB).
- 위험: 사용자 시스템 언어가 위 목록 밖이면 Electron 자체가 en 폴백.

### Step E3 (Step E1 소규모 검증) — `@google/genai` 만 먼저 이동

- Step E1 을 대량으로 하기 전에 소규모로 검증. 25 MB 감량 + 스모크 통과 확인.

### Step E4 — `asarUnpack` 최소화 (유보)

- 근거: §1.8.
- 블로커 1: `src-electron/main.ts:388-392` — `staticDir = path.join(process.resourcesPath, "app.asar.unpacked", "dist")` 참조. dist 가 asar 안으로 들어가면 이 경로 없음.
- 블로커 2: `src-electron/express-server.ts:24` — `app.use(express.static(staticDir))`. **express.static 은 asar 내부 파일을 서빙할 수 없다** (fs.stat/open 이 asar 프로토콜 지원 안 함).
- 감량 폭(-5~15 MB) 대비 리팩터 규모 커서 유보. §6 참고.

### Step E5 (선택) — recharts 3.x → 2.x 다운그레이드 스파이크

- Step E1 이 적용되면 recharts 는 이미 asar 에서 빠지므로 데스크탑 앱 관점에서 의의가 사라진다. 웹 번들 관점의 별도 스파이크로.

---

## 5. 실행 결과

| Step | 조작 | 결과 | 판정 |
|---|---|---|---|
| E1 v1 (취소) | `!node_modules/**` + 3개 whitelist | asar -98% 감량은 됐으나 conf transitive(ajv 등) 부재로 런타임 크래시 위험 → 리버트 | 취소 |
| E1 v2 (취소) | negative 패턴 (`!node_modules/react-icons` 등) | asar -85% 감량됐으나 `dist/**/*` unpacked 규칙과 상호작용해 렌더러 로드 실패 → 리버트 | 취소 |
| **E1 v3** | 렌더러 전용 15개 dep 을 **`devDependencies` 로 이동** | **.app -29.3%, asar -87.5%**, react-icons/recharts/redux-toolkit/es-toolkit/zod/react-router/react-dom/tanstack/immer 100% 제거. 스모크 15초 통과 | ✓ |
| **E2** | `electronLanguages: ["ko","en","en-US"]` 추가 | **.app -15.4%**, lproj 220개 → 2개. Frameworks 274 → 229 MB. 스모크 15초 통과 | ✓ |
| **E3** | `@google/genai` → devDependencies (E1 v3 앞서 소규모 검증) | **.app -6.2%, asar -16.5%**. genai + web-streams-polyfill + protobufjs 100% 제거. 스모크 통과 | ✓ |
| E4 (유보) | `asarUnpack: ["dist/**/*"]` 제거 | 위 §4 블로커 → §6 남은 이슈 | 유보 |

**스모크 검증**: 각 스텝 뒤 앱 실행 15초 유지 + 창 3개 자식 프로세스(renderer, gpu, utility) 확인. 로그에서 `창 생성 실패`, `Express 서버 시작 실패`, `ERR_FAILED` 부재 확인. Auto-updater `app-update.yml` 부재 경고는 서명 없는 로컬 실행 특성 — 정상.

**초과 달성 이유**: 계획 §목표는 각 스텝 감량 하한 합산(≤260 MB, -41%)이었으나 실제로는 -43.9%. `devDependencies` 이동이 명시적으로 계획한 것보다 넓은 범위를 잡아 목표를 초과했다. 특히 web-streams-polyfill/protobufjs/immer/react-redux 같은 transitive 들도 자동으로 함께 제거됐다.

---

## 6. 남은 이슈 (별도 스파이크)

**Step E4 — asarUnpack 최소화.**

`package.json:100-103` 의 `asarUnpack: ["dist/**/*", "node_modules/get-windows/**/*"]` 에서 `dist/**/*` 만 제거하는 게 목표. asar 압축 이득 -5~15 MB 예상.

가능한 방향:
1. Electron `protocol.registerFileProtocol` 로 `app://` 스킴을 만들고 렌더러가 그 URL 로 로드. Express 서버 자체 제거 가능.
2. `express.static` 대신 asar 내부 로더를 구현 (`fs.readFileSync` 는 asar 지원함).
3. 유지: 감량 폭 대비 리팩터 비용 크므로 유보.

**`directories.output` 함정 (v1.3.0 릴리즈 실사고)**

`directories.output` 을 명시하지 않으면 electron-builder 는 **`dist/` 안에 dmg/zip 산출물을 저장한다**. 그런데 `build.files: ["dist/**/*"]` 규칙이 이걸 asar 에 담아 두 번째 빌드부터 이전 dmg 가 asar 에 재귀 포함되어 팽창(v1.3.0 최초 시도: dmg 670 MB — 실제 앱 크기의 3배). **해결**: `directories.output: "release"` 로 산출물 분리. 이미 반영됨(`fix(release):` 커밋).

`scripts/perf-measure-electron.mjs` 는 `-c.directories.output=release` 를 CLI 로 명시하므로 이 문제에서 자유로웠고 배포 파이프라인만 영향을 받았다.

---

## 7. 취소 조건 (언제 롤백하나)

각 스텝은 다음 조건 중 하나라도 걸리면 즉시 리버트:

1. **주요 판정 지표 개선 없음/회귀**: E1/E2/E3 중 어느 하나라도 개선 0 또는 +5% 이상 회귀.
2. **런타임 크래시**: 패키징된 앱을 열었을 때 즉시 크래시하거나 로그에 module not found.
3. **콘솔/pageerror 폭증**: 웹 세션 [`perf:bundle:after`](./lightening-web-bundle.md) 로 콘솔 회귀 감시.
4. **CI/배포 실패**: Vercel preview, `npm run check` 실패.

취소된 스텝은 원인 재조사 후 별도 이슈로. "다시 시도" 는 다음 PR.

---

## 8. 재현 방법

```bash
# Node 20.19+ / 22.12+ 필요 (electron-builder 26 요구)
node -v

npm install
npm run perf:electron:before    # 실측 → perf-out/electron/before/summary.md

# 세부 파악: asar 내부 파일 목록
node -e '
const r = require("./perf-out/electron/before/asar-contents.json");
r.deps.slice(0,20).forEach(d=>console.log((d.bytes/1024/1024).toFixed(2).padStart(7),"MB",d.path));'

# 특정 dep 사슬 추적
npm ls @google/genai
npm ls @reduxjs/toolkit
npm ls web-streams-polyfill

# 변경 후
npm run perf:electron:after
npm run perf:electron:diff      # 임계값 초과 시 exit 1

# 스모크 (스크립트 밖)
"release/mac-arm64/외요의 캠스터디.app/Contents/MacOS/외요의 캠스터디" > /tmp/log 2>&1 & sleep 15
```

---

## 9. 산출물 위치

- 이 문서 (원인 · 계획 · 결과 통합): `docs/lightening-electron-app.md`
- 측정 스크립트: `scripts/perf-measure-electron.mjs`
- 스냅샷/리포트 (로컬 전용, `.gitignore`): `perf-out/electron/{before,after}/`, `perf-out/electron/diff.md`
- npm 스크립트: `perf:electron:{before,after,diff}` (`package.json`)
- 실제 배포 산출물: [v1.3.0 GitHub Release](https://github.com/sabit1997/cam-study/releases/tag/v1.3.0) — dmg 107 MB (v1.2.0 670 MB 대비 -84%)
- CI 훅: 별도 PR (`.github/workflows/perf-electron.yml`) — Node 20.19+ 러너, macOS runner

웹 번들 감량은 [`docs/lightening-web-bundle.md`](./lightening-web-bundle.md) 참고. 두 파이프라인은 독립적으로 굴린다.
