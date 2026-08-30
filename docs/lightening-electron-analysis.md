# Electron 데스크탑 앱 경량화 원인 분석

> 목적: 사용자가 다운받는 `외요의 캠스터디.app`이 왜 이렇게 큰지 실측으로 짚어내고, `docs/lightening-electron-plan.md`의 근거를 남긴다.
> 스코프: macOS `.app` 산출물 (`release/mac-arm64/외요의 캠스터디.app`). Windows/Linux는 동일 규칙 적용.
> 측정 원천: `npm run perf:electron:before` → `perf-out/electron/before/{summary.md, electron.json, asar-contents.json}`.
> 실측 커밋: 웹 번들 세션 완료 이후 (`main` HEAD). Node 20.19.6 + electron-builder 26.15.3 + Electron 43.0.0.

---

## 0. 지표 요약 (Baseline)

| 항목 | 크기 | 비율 |
|---|---|---|
| **.app 총합** | **443.43 MB** | 100% |
| ├ Contents/Frameworks (Electron 런타임 + 로케일) | 274.24 MB | 62% |
| │  └ 로케일 `.lproj` 220개 | 46.39 MB | 10% |
| │  └ 로케일 `.pak` 3개 | 7.11 MB | 2% |
| ├ **app.asar** (앱 코드+node_modules) | **166.99 MB** | **38%** |
| │  └ node_modules | **162.01 MB** | 37% |
| │  └ dist-electron (main/preload 번들) | 2.94 MB | <1% |
| │  └ dist (웹 번들) | 1.25 MB | <1% |
| └ app.asar.unpacked (get-windows native) | 1.53 MB | <1% |

**한 줄 요약**: 274MB는 Electron 런타임(줄이기 어려움), **167 MB의 `app.asar`가 통제 가능한 감량 대상**이며 그 중 **162 MB가 node_modules**다.

---

## 1. app.asar 안 node_modules 상위 15개

| 패키지 | 크기 | 참여 사슬 |
|---|---|---|
| **react-icons** | **81.90 MB** | `dependencies` 직접 지정 |
| **@google/genai** | **14.24 MB** | `dependencies` 직접 지정 (원래 서버용) |
| web-streams-polyfill | 8.54 MB | `@google/genai` → google-auth-library → gaxios → node-fetch → fetch-blob |
| react-dom | 6.98 MB | 필수 |
| recharts | 6.32 MB | `dependencies` 직접 지정 |
| **@reduxjs/toolkit** | **5.43 MB** | **`recharts@3.9.2` → transitive** (3.x부터 새로 편입) |
| zod | 4.03 MB | `dependencies` 직접 지정 |
| react-router | 3.66 MB | `react-router-dom` 하위 (실제 필요) |
| protobufjs | 2.77 MB | `@google/genai` → transitive |
| **es-toolkit** | **2.62 MB** | **`recharts@3.9.2` → transitive** |
| @tanstack/query-core | 1.98 MB | `@tanstack/react-query` 하위 |
| **node-gyp** | **1.73 MB** | `@electron/rebuild`(devDep) + `get-windows` — **runtime 불필요** |
| axios | 1.49 MB | dev 프록시 서버가 씀 |
| js-yaml | 0.90 MB | `electron-store` 사슬 (필요) |
| ajv | 0.90 MB | `electron-store` 사슬 (필요) |

---

## 2. 결정적 인사이트 — main 프로세스는 사실상 node_modules를 안 씀

**증거.**

`scripts/build-electron.js:55-61` — esbuild가 main 프로세스를 번들할 때 **external로 남기는 것은 5개뿐**:

```
external: ["electron", "fsevents", "get-windows", "electron-store", "conf"]
```

`src-electron/**/*.ts`가 import 하는 것 (`grep`으로 추적):

```
axios, child_process, crypto, electron, electron-updater, express, fs,
http-proxy-middleware, net, os, path, vitest (테스트만)
```

이 중 external 5개(`electron`, `fsevents`, `get-windows`, `electron-store`, `conf`)를 뺀 나머지 — `axios`, `electron-updater`, `express`, `http-proxy-middleware` — 는 **esbuild가 `dist-electron/main.js` (3.1 MB)에 모두 번들**한다. `grep -oE "electron-updater" dist-electron/main.js | wc -l` → 156회 등장으로 실측 확인.

**따라서 runtime에 `node_modules/`에서 실제 로드되는 것은 3개**:
- `electron-store` (1.1 MB)
- `conf` (2.4 MB, electron-store 하위)
- `get-windows` (6.2 MB, native — `asarUnpack` 대상)

**총 ~10 MB.** 나머지 **~152 MB는 electron-builder가 `dependencies` 폴더 전체를 무지성으로 asar에 담은 결과**다.

---

## 3. 웹 번들 tree-shaking과 electron-builder는 별개다

**증거.**

웹 번들에서 `react-icons`는 subpath import(`react-icons/fi/FiCheck` 등)만 써서 실제 청크에는 아이콘 몇 개만 실린다 (웹 번들 `fi-*.js` 6.6 KB). 그런데 asar에는 **`node_modules/react-icons/` 폴더 전체 81.9 MB가 통째로** 실린다.

이유: electron-builder는 `package.json`의 `dependencies` 목록을 훑어 각 폴더를 통째로 복사한다. **소스가 어떤 subpath만 참조하는지 모른다.**

같은 이유로:
- `zod` 4 MB — 웹 번들엔 lazy 청크로 격리 완료(웹 세션 Step 2), asar엔 전체
- `recharts` 6.3 MB — 웹 번들 lazy, asar 전체 (+ transitive 8 MB)
- `@google/genai` 14.2 MB — 웹 번들엔 애초에 없음(서버 전용), asar에는 전체 + web-streams-polyfill 8.5 MB + protobufjs 2.8 MB

**이건 electron-builder의 태생적 특성**. `files` 필터로 명시 제외해야 한다.

---

## 4. `@google/genai` 사슬은 렌더러 무관 — 25 MB 편승

- `dependencies` 목록에 `@google/genai` 있음.
- 렌더러(웹)는 `/api/ai-*` 프록시만 호출. genai SDK 직접 사용 안 함.
- Main 프로세스도 SDK 직접 사용 안 함 — express 프록시가 Vercel로 릴레이.
- **개발 환경에서 Vite dev 미들웨어(`vite.config.mts`)와 서버리스 함수(`api/ai-interpret.ts`)가 `server/ai-interpret.ts`를 통해 SDK를 씀.** 배포된 데스크탑 앱에는 이 코드 경로가 없음.

**결론**: `@google/genai`는 dev/server 전용. `devDependencies`로 옮기거나(server/api를 별도 workspace로 분리) files 필터로 asar에서 제외 가능. 감량 25 MB(genai 14 + web-streams-polyfill 8.5 + protobufjs 2.8).

---

## 5. recharts 3.x transitive — redux-toolkit + es-toolkit

- `recharts@3.9.2` 는 내부 상태 관리를 위해 `@reduxjs/toolkit`(5.4 MB)와 유틸을 위해 `es-toolkit`(2.6 MB)을 씀. 2.x에는 없던 신규 dep.
- 웹 번들에는 tree-shaking 되지만 asar에는 두 폴더 전체가 편입 → +8 MB.
- 감량 옵션: (a) files 필터로 asar에서 제외 (안전), (b) recharts 2.x로 다운그레이드(리팩터 영향, 검증 필요), (c) 차트 라이브러리 교체.

---

## 6. Electron 로케일 46 MB × 220개

**증거.** `Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/*.lproj` 220개 폴더. top 8만 나열:

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

**한국어 앱**인데 220개 언어 리소스가 전부 딸려온다. `electron-builder`의 `electronLanguages` 설정으로 필요한 것만 유지 가능.

`ko`, `en`, `en_US` 정도만 남기면 → 대략 46 MB → 1~2 MB. **감량 약 44 MB.**

---

## 7. `asarUnpack: ["dist/**/*", ...]` — 웹 자산이 asar 밖에

`package.json:97-100` 참조. `dist/**/*` 를 asarUnpack 대상으로 지정.

- 결과: 웹 번들(`dist/`)이 압축 없이 파일 시스템에 개별 파일로 풀림.
- 웹 세션 분석 §7과 동일 이슈. asar 안으로 들여보내면 asar 헤더 압축 이득 + 파일 개수/스캔 부담 감소.
- 다만 이 감량은 상대적으로 작음(~5–15 MB). 위 Step들이 훨씬 큼.

---

## 8. node-gyp 1.7 MB 편승 (dev 도구가 asar 안에)

- `@electron/rebuild@4.1.0`(devDependency)와 `get-windows@9.3.0` 하위에 `node-gyp` 두 개가 있음.
- 원칙적으로 devDependencies는 electron-builder가 자동 제외. 그런데 asar 안에 있다는 것은 `get-windows` 사슬 쪽 것이 남은 것으로 보임 — get-windows가 native module이라 그 빌드 도구가 함께.
- runtime에 node-gyp는 필요 없음. files 필터로 제외 가능.

---

## 9. Frameworks 274 MB (Electron 런타임)

- Electron 43 chrome 137. 프레임워크 자체는 줄이기 어렵다.
- 그나마 감량 가능한 것: 로케일(§6), 후보로 `swiftshader`(V8 CPU fallback) 등. 후자는 정상 앱 크래시 회복력에 영향 가능 — 위험 vs 감량 미미 → 유보.

---

## 재현 방법

```bash
# Node 20.19+ / 22.12+ 필요 (electron-builder 26 요구)
node -v

npm install
npm run perf:electron:before      # 실측 → perf-out/electron/before/summary.md

# 세부 파악: asar 내부 파일 목록
node -e '
const r = require("./perf-out/electron/before/asar-contents.json");
r.deps.slice(0,20).forEach(d=>console.log((d.bytes/1024/1024).toFixed(2).padStart(7),"MB",d.path));'

# 특정 dep 사슬 추적
npm ls @google/genai
npm ls @reduxjs/toolkit
npm ls web-streams-polyfill
```

자동 파이프라인 상세는 `docs/lightening-electron-plan.md §1` 참고.
