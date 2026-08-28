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

### 증거 자료 굽기

숫자만으로는 나중에 "정말 그랬나"를 확인할 수 없다. 측정 뒤에 시각 증거를 남긴다.

```bash
npm run bundle:before        # 또는 bundle:after — dist 를 만든다
npm run bundle:evidence before
```

```bash
npm run bundle:devtools before   # 실제 DevTools Network 패널
```

| 산출물 | 무엇의 증거인가 |
| --- | --- |
| `bundle-out/<label>/treemap.png` | rollup-plugin-visualizer 트리맵. **어느 패키지가 어느 청크 안에 있는지** 눈으로 확인된다. zod 가 `index` 안에 있는지 lazy 청크로 옮겨갔는지가 바로 보인다 |
| `bundle-out/<label>/devtools-network.png` | **실제 Chrome DevTools Network 패널.** 도구 자신의 화면이라 가장 강한 증거다. 요청 목록·크기·워터폴·하단 요약(요청 수, 전송량, DOMContentLoaded, Load)이 전부 들어간다 |
| `bundle-out/<label>/network.png` | 같은 데이터를 표로 렌더한 것. 로컬 요청만 필터하므로 Google Fonts 등 외부 요청이 빠진다 |
| `bundle-out/<label>/network.json` | 위 표의 원본 데이터 |
| `bundle-out/<label>/app.png` | 앱 화면. 경량화 후에도 화면이 뜬다는 증거 |
| `bundle-out/timing/timing.png` | 첫 로드 시간 before/after. 회차 원값을 점으로 전부 찍고 중앙값을 세로선으로 표시해, 두 계열이 겹치는지 벌어지는지가 그림에서 판정된다 |

### 시간 측정

```bash
# 각 브랜치에서 dist 스냅샷을 뜬다 (working tree 가 깨끗해야 한다)
git switch perf/bundle-baseline   && npm run timing:snapshot before
git switch perf/bundle-diet-zod-lazy && npm run timing:snapshot after

# 두 스냅샷을 한 세션에서 교차 실행
npm run timing:compare -- --runs=9
```

크기 주장과 속도 주장은 다르다. "3.08 MB → 1.79 MB" 는 크기 주장이고, 기동이 빨라졌다고 말하려면 ms 를 재야 한다. 이 하네스가 신경 쓰는 것 세 가지.

- **스로틀링** — localhost 는 대역폭이 사실상 무한이라 바이트 차이가 시간으로 드러나지 않는다. Fast 3G(RTT 562.5 ms) + CPU 4× 를 걸어야 임계 경로 요청 수 차이가 왕복 횟수로 나타난다.
- **교차 실행** — before 를 N번 돌린 뒤 after 를 N번 돌리면 그 사이 머신 상태 변화가 한쪽에만 얹힌다. 회차마다 번갈아 돌리고 순서도 뒤집는다.
- **차이 > 잡음 점검** — 이게 ⚠ 면 그 지표로는 빨라졌다고 말할 수 없다. 중앙값만 보여주면 잡음이 숨으므로 PNG 에 회차 원값을 전부 찍는다.

두 스냅샷의 커밋이 같으면 실행을 거부한다 — 같은 브랜치에서 두 번 뜨는 실수를 막는다.

### DevTools 캡처가 왜 이렇게 생겼나

`capture-devtools.mjs` 는 우회로가 세 개 있다. 전부 실패를 밟고 나온 것이라 지운 뒤 다시 밟지 않도록 적어둔다.

**Playwright 로는 DevTools 를 열 수 없다.** Chrome 은 디버거를 하나만 허용한다. Playwright 가 CDP 로 붙어 있으면 `--auto-open-devtools-for-tabs` 도 F12 도 무시된다. 그래서 이 스크립트만 Playwright 를 쓰지 않고 `chrome.exe` 를 직접 띄운다.

**화면 영역 캡처(`CopyFromScreen`)는 쓰지 않는다.** 창을 포그라운드로 올리는 데 실패하면 그 자리에 있던 **다른 창이 찍힌다.** 실제로 무관한 앱 창이 캡처된 적이 있다. 지금은 `PrintWindow(PW_RENDERFULLCONTENT)` 로 창 자신의 버퍼를 뜬다 — 다른 창의 내용은 구조적으로 들어올 수 없고 포커스도 필요 없다. 대신 Chrome 의 GPU 합성 페이지 영역은 흰색으로 나온다(패널이 목적이라 무해하고, 앱 화면은 `app.png` 가 담당).

**DevTools 가 붙기 전에 로드하면 패널이 빈다.** `Ctrl+R` 을 보내려면 포커스가 필요해 위 문제로 돌아간다. 그래서 Chrome 을 `/__boot` 로 띄우고, 그 페이지가 몇 초 뒤 스스로 `/` 로 이동하게 했다. 포커스가 필요 없다.

부수적으로 두 가지를 프로필 설정으로 박아둔다. Network 패널 선택 + Disable cache + DevTools 를 창 높이의 대부분으로(기본 크기로는 요청이 4줄만 보여 증거가 안 된다). 그리고 이 스크립트는 **직접 빌드한다** — 다른 브랜치의 `dist/` 가 남아 있으면 라벨과 내용이 어긋난다. 실제로 `before` 로 찍었는데 `command-palette` 청크가 찍혀 나온 적이 있다.

브라우저는 **시스템 Chrome**(`channel: "chrome"`)을 쓴다. Playwright 전용 Chromium(~150 MB)을 내려받지 않으려는 의도적 선택이다. 같은 이유로 `perf-measure.mjs` 는 지금 상태에서 Chromium 설치 없이는 돌지 않는다.

`network.png` 의 요청 수는 초기 로드 세트보다 많다 — 라우터가 라우트 청크(비인증이면 `sign-in`)까지 받기 때문이다. 두 숫자는 재는 대상이 다르므로 섞지 않는다.

**A 계층만 그림이 나온다.** B·C·D 는 대신 이렇게 본다.

| 계층 | 시각화 수단 |
| --- | --- |
| B Electron 메인 | `dist-electron/meta.json` 을 [esbuild.github.io/analyze](https://esbuild.github.io/analyze/) 에 올리면 같은 형태의 트리맵이 나온다. 로컬 산출물이라 업로드 없이 쓰려면 리포트의 패키지별 표를 쓴다 |
| C 프로덕션 의존성 | 리포트의 상위 15개 표. 트리맵으로 만들 만한 계층 구조가 아니다(플랫하게 설치된다) |
| D 인스톨러 | `bundle-out/<label>/asar-list.txt` — asar 안의 전체 항목 목록. 정정 5의 1차 증거다 |

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
| node_modules 전체 (dev 포함) | 880.15 MB (35,963 파일) — 참고값 |

> dev 포함 전체는 **환경 의존적이라 재현되지 않는다.** 같은 커밋에서 `npm install` 을 다시 돌리자 538.20 MB 가 나왔다 — optional·플랫폼별 패키지 설치 상태가 갈린다. 판정에는 프로덕션 서브셋만 쓴다.

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

## AFTER — 적용된 개선

각 항목을 독립 브랜치로 분리해 서로의 효과가 섞이지 않게 했다. 모두 clean tree 에서 측정했다.

| 브랜치 | 계층 | 지표 | BEFORE | AFTER | |
| --- | --- | --- | --- | --- | --- |
| `perf/bundle-diet-minify` | B | main.js raw | 2.94 MB | **1.75 MB** | −40.5 % |
| | | main.js gzip | 591.7 KB | 496.1 KB | −16.2 % |
| `perf/bundle-diet-zod-lazy` | A | **임계 경로 raw** | 518.5 KB | **408.4 KB** | **−21.2 %** |
| | | 초기 로드 gzip | 162.0 KB | 127.9 KB | −21.0 % |
| | | 초기 청크 수 | 7 | 3 | |
| `perf/bundle-diet-deadcode` | C | 프로덕션 패키지 | 435 | **410** | −25 |
| | | 프로덕션 용량 | 186.81 MB | 185.81 MB | −1.00 MB |
| | | 프로덕션 파일 | 13,755 | 13,345 | −410 |

### 각 항목에서 배운 것

**minify (B)** — `scripts/build-electron.js` 에 `minify: true` 한 줄. 발표자료의 예상(−42 %)과 거의 같다. 다만 유닛 테스트는 TS 소스를 돌려서 minify 된 산출물을 훑지 않는다. `src-electron/express-server.ts` 가 electron 에 의존하지 않는다는 점을 이용해, 같은 esbuild 설정으로 minify 만 켜고/끄고 번들해 순수 node 에서 띄워 응답을 비교했다 — 정적 서빙 · Express 5 SPA 폴백 · JSON 파싱 · 한글 에러 메시지 모두 동일했다.

**zod lazy (A)** — `src/App.tsx` 의 정적 import 두 줄을 lazy 로 바꾼 것이 전부다. zod 121.7 KB 가 `ai-action-runner` lazy 청크로 옮겨갔다.

여기서 측정 방식이 판단을 가를 수 있다는 것을 실제로 겪었다. **`index` 청크는 355.7 → 373.0 KB 로 커졌다.** Rollup 이 재청킹해 `config`·`useQuery`·`middleware`·`window-state` 를 `index` 로 합쳤기 때문이다. 청크 하나만 봤다면 개선을 회귀로 오판했을 것이다. 그래서 초기 로드 세트를 1순위 지표로 올렸다.

#### 이 개선이 줄이는 것과 줄이지 않는 것

브라우저 캡처(`bundle-out/*/network.json`)가 주장의 범위를 좁혀준다. **총 전송량은 변하지 않는다.**

| | BEFORE | AFTER |
| --- | --- | --- |
| 임계 경로 (첫 페인트를 막는 것) | 518.5 KB · 7개 | **408.4 KB · 3개** |
| 세션 총 JS 전송량 | 523.7 KB · 9개 | 523.8 KB · 9개 |

AFTER 의 요청 목록에 `ai-action-runner` 78.8 KB · `command-palette` 18.9 KB · `ai-action-describe` 3.3 KB — 합 101 KB 가 그대로 있다. `<Suspense>` 안에서 마운트되므로 앱이 뜨는 즉시 받아온다. 즉 **101 KB 가 "다운로드되지 않게" 된 것이 아니라 "첫 페인트를 막지 않게" 된 것이다.** 이득은 실재하지만 그 종류가 다르다.

더 줄이려면 팔레트를 열 때만 마운트해야 한다(`{isOpen && <CommandPalette/>}`). 하지만 `AiActionRunner` 는 `null` 을 렌더하면서 모듈 변수 `currentRun` 에 store 연결 클로저를 등록하는 브리지다 — `runAiActions` 가 이걸 통해 동작한다. 그리고 `components/onboarding/first-run-modal.tsx` 도 팔레트와 무관하게 `runAiActions` 를 호출한다. 따라서 팔레트 열림에 종속시키면 온보딩의 AI 액션이 조용히 깨진다. **여기서 멈춘 이유는 게으름이 아니라 이 제약이다.**

#### 그래서 실제로 빨라지는가 — 9회 중앙값

크기 주장과 속도 주장은 다르다. 속도를 말하려면 시간을 재야 한다. `npm run timing:compare` 로 9회 교차 실행한 결과다. 기준: before `707cefd` / after `20edee0`, Fast 3G(205 KB/s · RTT 562.5 ms) + CPU 4×, 회차마다 캐시 비움.

| 지표 | before 중앙값 | after 중앙값 | 차이 | 잡음(IQR) | 판정 |
| --- | --- | --- | --- | --- | --- |
| **FCP** | 5312 ms | **4420 ms** | **−892 ms (−16.8 %)** | 224 ms | 차이 > 잡음 ✓ |
| DOMContentLoaded | 4800 ms | 3980 ms | −820 ms (−17.1 %) | 299 ms | 차이 > 잡음 ✓ |
| load | 4814 ms | 3991 ms | −823 ms (−17.1 %) | 294 ms | 차이 > 잡음 ✓ |
| load 시점 JS 요청 수 | 7 | 4 | −3 | 0~2 | |

세 지표 모두 차이가 잡음 폭보다 크다. 회차 원값은 `bundle-out/timing/summary.md` 에 있고 점 구름이 겹치지 않는 것은 `timing.png` 에서 볼 수 있다.

**기전은 바이트가 아니라 왕복 횟수다.** RTT 562.5 ms 에서 임계 경로 JS 요청이 7개에서 4개로 줄었다. 로컬 무스로틀에서는 이 차이가 시간으로 드러나지 않는다 — 그래서 스로틀을 건다.

**자가점검이 ⚠ 를 하나 냈고, 그게 중요하다.** load 시점 전송량이 564.5 → 462.7 KB 로 101.8 KB 차이가 난다. 총량이 줄어든 것이 아니다. 밀린 AI 청크의 합이 정확히 그 값이다.

```
ai-action-runner    78.8 KB
command-palette     18.9 KB
ai-action-describe   3.3 KB
                  ─────────
                   101.0 KB   ≈ 101.8 KB
```

즉 **AI 청크는 `load` 이후에 도착한다** — 무엇도 막지 않는다는 뜻이고, 위 표의 시간 개선이 어디서 왔는지에 대한 답이다. 총 세션 전송량은 무스로틀 측정에서 523.7 → 523.8 KB 로 그대로다.

덧붙여 `useCommandPalette` 를 `AppShell` 로 끌어올렸다. 이 훅의 keydown 리스너를 lazy 컴포넌트 안에 두면 청크가 내려오기 전까지 Cmd+K 가 죽는다. 훅은 작고 zod 를 끌지 않아 정적으로 둬도 대가가 없다.

**데드코드 (C)** — `@uiw/react-color`(전이 의존성까지 25개), `components/statics-section.tsx`, `app/**`(Next.js 잔재 6개). 셋 다 이미 모듈 그래프 밖이라 A 는 변하지 않는다.

`app/favicon.ico` 는 지우지 않고 `public/` 으로 옮겼다. `index.html` 이 `/favicon.ico` 를 참조하는데 `public/` 에 없어서 **빌드 산출물에 favicon 이 빠져 있었다** — 즉 favicon 이 404 였다. 옮기면서 고쳐진다.

### 패키징 검증 (통합 브랜치)

세 개선을 `perf/bundle-integration` 으로 합쳐 한 번에 검증했다. 이 작업의 주된 실패 모드는 dev 가 아니라 패키징 후에 드러나기 때문이다.

**먼저 패키징이 아예 깨져 있었다.** `directories.output` 이 없어 기본값 `dist` 를 쓰는데 Vite 의 `outDir` 도 `dist` 이고 `files` 에 `dist/**/*` 가 있다. electron-builder 가 자기 출력을 자기 입력 glob 으로 다시 잡아 파일 목록이 어긋난다.

```
⨯ ENOENT: no such file or directory, open 'dist\assets\ai-action-describe-B1bRkrwp.js'
```

없다고 한 파일의 해시가 그 시점 `dist` 에 있던 것(`CHhhlIq8`)과 다르다. **크기 문제로만 알고 있었는데 빌드를 죽이고 있었다.** `directories.output` 을 `release` 로 옮겨 해결했다.

| 항목 | 고치기 전 | 고친 뒤 |
| --- | --- | --- |
| `app.asar` | 524.06 MB | **164.32 MB** |
| asar 내 `win-unpacked` 항목 | 75 | **0** |
| `win-unpacked` 전체 | 882.63 MB | 524 MB |

**패키징된 앱 실행 결과** (`release/win-unpacked/외요의 캠스터디.exe`):

| 확인 항목 | 결과 |
| --- | --- |
| 기동 · 창 표시 | ✓ (`bundle-out/packaged/app-window.png`) |
| `MODULE_NOT_FOUND` / `Cannot find module` | **없음** |
| 처리되지 않은 예외 | 없음 (electron-updater 건 제외, 아래) |
| `electron-store` | ✓ **로그인 세션과 창 배치가 복원됐다** |
| `electron-updater` | `--dir` 빌드에는 `app-update.yml` 이 없어 실패가 정상. 그 지점까지 실행되고 정상적으로 에러를 낸 것이 minify 된 코드가 살아있다는 증거다. NSIS 빌드에서는 `app-update.yml` 이 정상 생성된다 |
| NSIS 인스톨러 | ✓ `release/CamStudySetup.exe` **124.83 MB** |

**아직 사용자 손이 필요한 것**: 방해요소 tracker(`get-windows`)는 실제로 공부 세션을 시작하고 다른 앱으로 전환해야 검증된다. `get-windows` 는 esbuild `external` 이자 `asarUnpack` 대상이라 이 작업에서 가장 깨지기 쉬운 지점이다.

> 인스톨러 124.83 MB 를 발표자료의 233.7 MB 와 직접 빼면 안 된다. 그쪽은 CI 릴리스 빌드(v1.2.0)의 HTTP `Content-Length` 이고 이쪽은 로컬 빌드다 — 서명·압축 조건이 다르다. **통제된 before/after 인스톨러 비교는 아직 하지 않았다.** 하려면 `main` 에서도 로컬로 같은 명령을 돌려야 한다.

## 라운드 2 — 임계 경로 밖으로

1라운드가 임계 경로에서 zod 를 들어내는 일이었다면, 2라운드는 **첫 로드 이후**를 건드린다. 라우트 청크, 재방문, 앱 재실행, 그리고 리렌더. 항목마다 브랜치를 나눠 clean tree 에서 쟀다.

| 브랜치 | 무엇을 | BEFORE | AFTER | |
| --- | --- | --- | --- | --- |
| `perf/bundle-diet-tooltip` | `home` 청크 raw | 113.6 KB | **68.6 KB** | −39.6 % |
| | `home` 청크 gzip | 36.6 KB | 21.2 KB | −42.1 % |
| `perf/bundle-diet-qs` | **임계 경로 raw** | 408.4 KB | **368.7 KB** | **−9.7 %** |
| | 홈 진입 FCP | 4820 ms | **4420 ms** | −400 ms |
| | 창 표시 | 7057 ms | **6596 ms** | −461 ms |
| `perf/font-local` | cross-origin 전송량 | 48.2 KB | **0.1 KB** | 외부 의존 소멸 |
| | CDN 3 s 지연 시 FCP | 5020 ms | **해당 경로 없음** | |
| `perf/sw-cache-first` | 재방문 서버 요청 | 14 | **2** | −85.7 % |
| | 재방문 서버 전송량 | 653.7 KB | **16.1 KB** | −97.5 % |
| | 오프라인에서 앱 셸 | **0/5** | **5/5** | |
| `perf/static-cache-headers` | 앱 재실행 시 304 왕복 | 12 | **1** | −11 |
| | Vercel `/assets` 정책 | `max-age=0` | `immutable` | 배포 후 검증 |
| `perf/render-round2` | idle 렌더 시간 | 23.6 ms | **1.5 ms** | −93.6 % |
| | focus 렌더 시간 | 3503.5 ms | **2710 ms** | −22.6 % |
| | resize 최대 커밋 | 284.3 ms | **186 ms** | −34.6 % |
| `chore/dead-code-round2` | 도달 불가 컴포넌트 | 12개 | **0** | |
| | JS 청크 수 | 24 | **22** | 리다이렉트 전용 라우트 |

### 각 항목에서 배운 것

**radix tooltip (A)** — 트리거가 창마다 3개뿐인데 `@radix-ui/react-tooltip` 이 `home` 청크에 45 KB 를 얹고 있었다. 게다가 `window-dock.tsx` 는 같은 모양의 툴팁을 이미 직접 그리고 있었다 — 같은 UI 를 두 방식으로 유지하던 셈이다.

radix 가 해주던 것 중 두 가지는 직접 구현해야 했다. 창 컨테이너가 `overflow-hidden` 이라 타이틀바 위로 뜨는 툴팁이 잘리므로 포털이 필요하고, 창이 화면 왼쪽 끝에 붙으면 가운데 정렬이 화면 밖으로 나가므로 렌더 후 실제 폭을 재서 한 번 보정해야 한다.

**시간은 줄지 않았다.** 7회 교차 측정에서 FCP +84 ms, 창 표시 −13 ms — 전부 잡음 아래다. `home` 은 라우트 청크라 임계 경로가 아니고, 요청 수가 그대로여서 zod lazy 때의 기전(왕복 감소)이 여기엔 없다. 크기와 의존성은 실재하는 이득이지만 **속도를 주장할 근거는 없다.**

이 항목에서 하네스의 구멍도 드러났다. 기존 `timing:compare` 는 비인증 상태를 재는데, `/` 가 sign-in 으로 튕기므로 `home` 청크를 아예 받지 않는다. 그 청크만 줄이는 개선은 차이가 **0 으로 나오는 것이 당연**했다. `--authed` 모드를 넣었다.

**qs (A)** — 중첩 객체·배열·커스텀 구분자를 지원하는 범용 직렬화기인데, 이 앱이 넘기는 것은 평평한 값 세 개(`date`·`done`·`order`)뿐이다. 그 기능이 하나도 쓰이지 않은 채 임계 경로에 실려 있었다.

교체 전에 테스트를 먼저 썼다. 기대값은 전부 **교체 전 qs 가 실제로 내던 문자열**이고, 9개가 qs 구현으로 통과하는 것을 확인한 뒤 구현을 바꿨다. 이 파일은 "새 구현이 맞는가" 가 아니라 "예전과 같은가" 를 묻는다. `URLSearchParams` 는 공백을 `+` 로, qs 는 `%20` 으로 낸다는 차이가 있어 그냥 바꾸면 안 됐다.

이번 라운드에서 **시간 개선이 잡음을 넘은 유일한 항목**이다. 임계 경로를 줄였기 때문이다.

`load` 시점 JS 요청 수가 3 → 4 로 늘어 보이는데 회귀가 아니다. 회차별 원값을 보면 before 도 3~4 를 오간다(3이 7회, 4가 2회 / after 는 4가 6회, 3이 3회). after 가 빨라져서 `load` 안쪽에 sign-in 라우트 청크가 더 자주 들어온 것 — 결과이지 원인이 아니다.

**Inter 로컬화 (A)** — `index.html` 이 `fonts.googleapis.com` 의 스타일시트를 `<link rel=stylesheet>` 로 걸고 있었다. 렌더 블로킹이다.

세 조건으로 범위를 좁혔다.

| 조건 | FCP |
| --- | --- |
| normal | 3824 ms |
| slow (CDN 응답 3초 지연) | **5020 ms** |
| offline (CDN 차단) | 3800 ms |

정상일 때는 FCP 에 영향이 없다 — JS 실행이 훨씬 늦게 끝나서 685 ms 짜리 CSS 가 그 뒤에 숨는다. offline 이 normal 과 같다는 것이 같은 이야기다. **이 변경은 평상시를 빠르게 하는 것이 아니라 우리가 제어할 수 없는 외부 응답을 임계 경로에서 들어내는 것이다.**

데스크탑에서는 이유가 하나 더 있다. 오프라인이면 폰트가 아예 적용되지 않는다. 프라이버시도 그렇다 — 앱을 열 때마다 사용자 IP 가 Google 로 갔다. README 가 "무엇을 애초에 받지 않는지" 를 다루는 앱에서 이건 어긋난다.

파일은 하나면 됐다. Inter v20 은 가변 폰트라 400·500·600·700 이 전부 같은 woff2 를 가리킨다(Google 이 내려주는 CSS 에서 확인). latin subset 48.3 KB.

**서비스 워커 (재방문·오프라인)** — 예전 구현은 모든 GET 을 network-first 로 처리하면서 install 에서는 `"/"` 하나만 캐시했다. 그래서 해시가 박힌 불변 자산까지 매번 네트워크를 치면서, 정작 오프라인에서는 index.html 만 나오고 JS·CSS 는 503 이었다. **껍데기만 뜨고 앱은 동작하지 않는 상태** — 오프라인 지원이라 부를 수 없다.

`/assets/**` 를 cache-first 로 바꿨다. 파일명에 콘텐츠 해시가 있어 내용이 바뀌면 URL 이 바뀌므로 캐시된 응답이 낡을 수 없다. 그 외는 network-first 로 두어 `index.html` 이 항상 최신 자산 해시를 가져오게 한다.

오프라인 화면이 이번 라운드에서 가장 분명한 증거다. before 는 **백지에 "Offline" 텍스트만**, after 는 상단바와 배경이 그려진다(`bundle-out/revisit/offline-*.png`).

다만 after 도 완전하지 않다. `Failed to fetch dynamically imported module: .../sign-in-*.js` 가 뜬다 — 오프라인에서 `AuthBootstrap` 이 `refresh()` 실패를 인증 만료로 취급해 로그아웃시키고 `/sign-in` 으로 보내는데, 그 라우트 청크가 캐시에 없어서다. 네트워크 실패와 401 을 구분해야 하는 **정합성 이슈**라 성능 항목과 분리했다.

**정적 캐시 헤더 (데스크탑·웹)** — `express.static` 의 기본값은 `Cache-Control: public, max-age=0` 이다. 헤더가 없는 것이 아니라 "캐시는 하되 쓰기 전에 매번 물어보라" 다. 그래서 앱을 켤 때마다 자산 하나하나에 조건부 요청이 오간다. 본문은 304 라 안 오지만 왕복은 그대로 일어난다.

배포본을 직접 찔러보니 웹도 같았다.

```
GET https://cam-study.vercel.app/assets/index-DO18IwY1.js
Cache-Control: public, max-age=0, must-revalidate
```

`/assets` 에 1년 `immutable` 을 명시했다. 줄어드는 것은 바이트가 아니라 왕복 횟수다 — 두 라벨 모두 전송 본문은 1.4 KB 로 같고 요청이 13 → 2 로 준다.

**리렌더 (렌더링)** — 세 가지가 같은 성격이라 함께 묶었다. 화면이 그대로인데 다시 그리는 경우들이다.

상단바 시계가 `Navigation` 안에 있어서 1초마다 상단바 전체가 다시 그려졌다. 상단바는 라우트와 무관하게 항상 마운트돼 있으므로 앱이 켜져 있는 내내 초당 한 번씩 일어나는 일이다. 창 콘텐츠에 `memo` 가 없어서 창을 한 번 클릭할 때마다 654줄짜리 `Timer` 가 통째로 다시 그려졌다. 좌표 동기화 effect 는 좌표가 그대로여도 새 객체를 넣어 리렌더를 유발했다.

**데드코드** — 어느 진입점에서도 import 되지 않는 컴포넌트 12개. 직접 도달 불가 8개를 지우면 `mypage-button`·`rectangle-button`·`circle-button`·`input-with-label` 4개가 함께 고아가 된다. `year-month-selector`·`loading`·`error` 는 `my-stats-page` 가 쓰고 있어 남겼다 — import 문 기준으로 확인했다.

`/my-page/statistics` 와 `/my-page/theme-setting` 은 `<Navigate>` 한 줄짜리 컴포넌트였다. lazy 페이지로 두면 리다이렉트 한 번을 위해 청크를 내려받는 왕복이 생긴다. 라우트에서 바로 `<Navigate>` 를 준다 — JS 청크 24 → 22 개.

### 측정에서 걸린 함정 여덟 개

이번 라운드에서 실제로 겪은 것들이다. **여섯 개는 개선을 회귀로, 또는 회귀를 개선으로 보이게 만들었다.** 수치를 인용하기 전에 이 목록을 훑는 편이 좋다.

**1. 리소스 타이밍은 cross-origin 전송량을 보고하지 않는다.** `Timing-Allow-Origin` 이 없으면 `transferSize` 가 0 이고 항목 자체가 안 잡히기도 한다. Google Fonts 를 로컬로 옮기는 변경에서 리소스 타이밍은 595.3 → 642.0 KB "증가" 로 보고했는데, CDP `encodedDataLength` 로 세니 658.6 → 657.2 KB 였다. before 의 CDN 폰트 48.8 KB 가 통째로 빠져 있었다. **외부 요청을 없애는 개선일수록 이 함정에 정확히 걸린다.**

**2. 클라이언트 계측은 서비스 워커 경유 요청을 구분하지 못한다.** SW 가 캐시에서 준 응답과 SW 가 네트워크로 다시 나간 요청이 잘 구분되지 않고 `encodedDataLength` 도 0 으로 보고되는 경우가 있다. CDP 로 재니 before/after 가 똑같이 나왔고, **서버가 받은 요청**을 세자 −12 건이 드러났다.

**3. `context.setOffline` 은 서비스 워커의 fetch 를 막지 못한다.** 페이지의 요청만 막는다. 오프라인 구간에 요청이 1~2건 실제로 서버에 도달하고 있었고, 그 상태의 "오프라인에서도 떴다" 는 결론은 성립하지 않는다. 서버에서 연결을 끊어야 SW 가 보는 세상이 진짜 오프라인이 된다.

**4. Playwright 의 `context.route` 를 하나라도 등록하면 브라우저 캐시가 우회된다.** 모든 요청이 인터셉트 경로를 타기 때문이다. 캐시 헤더 효과를 재는 측정에서 304 가 0건이 나왔다. API 를 서버에서 직접 처리하도록 바꿔야 했다.

**5. `express.static` 은 헤더를 안 주는 게 아니다.** `public, max-age=0` 을 준다. before 를 "헤더 없음" 으로 재현했더니 Chrome 이 조건부 요청조차 보내지 않아 304 가 0건이 됐고, 비교 자체가 무너졌다.

**6. Profiler 의 커밋 횟수는 주 지표가 아니다.** `<Profiler id="App">` 이 트리 전체를 감싸고 있어서, 어디가 얼마나 다시 그려지든 커밋은 1회로 잡힌다. 시계를 별도 컴포넌트로 내려도 커밋 횟수는 그대로고 줄어드는 것은 **범위**다. 그건 `totalDuration`·`maxDuration` 에 나타난다(23.6 → 1.5 ms). 처음에 "idle 에서 커밋이 줄어야 한다" 를 자가점검에 넣었다가 ⚠ 를 받고 기준을 고쳤다.

**7. 서비스 워커 효과는 2차 방문이 아니라 3차 방문에서 정착한다.** 1차 방문의 자산 대부분은 SW 가 `controller` 가 되기 전에 이미 로드돼 `cache-first` 핸들러를 거치지 않고, 따라서 캐시에도 들어가지 않는다. 캐시는 2차 방문에서야 채워진다. 2차로 재면 −1 건, 3차로 재면 −12 건이다.

**8. `startsWith("/api")` 는 `/apis/` 소스 경로를 삼킨다.** dev 서버가 모듈로 서빙하는 `/apis/services/...` 가 JSON 으로 반환되면서 앱이 통째로 죽는다. `vite.config.mts` 의 프록시 정규식에도 같은 주의가 적혀 있었는데 하네스에서 같은 실수를 반복했다.

### 이번 라운드에 늘어난 측정 도구

```bash
npm run timing:compare:authed   # 로그인 상태로 홈까지 진입해 라우트 청크를 잰다
npm run revisit:compare         # 재방문·오프라인 (서비스 워커)
npm run static-cache:compare    # 앱 재실행 시 조건부 요청 (캐시 헤더)
npm run ui:evidence <label>     # 화면이 그대로인지 스크린샷으로 확인
npm run dev:web                 # ↓ 리렌더 측정에는 dev 서버가 필요하다
npm run render:before / render:after / render:compare
```

| 도구 | 무엇을 재는가 | 주의 |
| --- | --- | --- |
| `timing:compare --authed` | 홈 라우트까지의 FCP·load·**창 표시** 시각 | API 지연을 고정 40 ms 로 둔다. RTT 를 그대로 물리면 왕복이 창 표시 시각을 지배해 청크 크기 효과가 묻힌다 — 절대값을 실서버 기준으로 읽으면 안 된다 |
| `revisit:compare` | 재방문 **서버** 요청 수·바이트, 오프라인에서 앱 셸이 뜨는지 | 정적 서버가 `no-store` 를 주므로 HTTP 캐시가 배제된 **SW 만의 기여분**이다 |
| `static-cache:compare` | 앱 재실행 시 조건부 요청(304) 왕복 | 반대로 여기는 SW 를 차단하고 HTTP 캐시만 본다 |
| `render:compare` | idle·focus·resize 세 시나리오의 렌더 시간 | dev 서버가 필요하다(`__perf` 는 DEV 전용). 절대 시간은 프로덕션보다 느리므로 상대 비교만 인용한다 |
| `ui:evidence` | 툴팁 기하, 실제로 나간 API URL | 로그인 쿠키를 주입하고 `/api/*` 를 가로채므로 실서버에 요청이 가지 않는다 |

---

### 아직 하지 않은 것

| 항목 | 기대 효과 | 막는 것 |
| --- | --- | --- |
| ~~`app.asar` 중복 Electron 런타임 제거~~ | ~~약 −333 MB~~ | **완료** — `directories.output: "release"`, 524.06 → 164.32 MB |
| 빌드 타임 전용 413개 배제 | 약 −160 MB | `ignoredProductionDependencies` + 패키징된 앱에서 `MODULE_NOT_FOUND` 부재 확인. asar 에 `node_modules` 10,383 항목이 아직 남아 있다 |
| 통제된 인스톨러 before/after | — | `main` 에서 로컬 NSIS 빌드를 떠야 비교가 성립한다 |
| recharts → 자체 SVG | record 청크 −325 KB | 발표자료 개선안 5. 공수 1~2일. `my-stats-page` 가 그리는 것은 `BarChart` 둘뿐이라 대체 자체는 어렵지 않다 |
| express → node:http + SSE | main.js −1.2 MB (minify 후 기준 재산정 필요) | 발표자료 개선안 6. SSE 재작성 리스크 |
| size-limit CI 게이트 | 회귀 방지 | 위 항목들이 정리된 뒤 예산을 정해야 의미가 있다 |
| Vercel `immutable` 헤더 실측 | 웹 재방문 왕복 제거 | 배포 후에야 검증된다. `curl -I .../assets/index-*.js` 한 줄이면 확인된다 |
| 오프라인에서 인증 유지 | 오프라인 앱 셸 완성 | 성능이 아니라 정합성 이슈. `AuthBootstrap` 이 네트워크 실패를 401 과 같게 취급해 로그아웃시키고, 캐시에 없는 `sign-in` 청크를 요청하다 실패한다 |
| `font/DungGeunMo.woff2` (946 KB) 처리 | 저장소 용량 | `tailwind.config.ts` 에 `dunggeunmo` 패밀리가 등록돼 있지만 `--font-dunggeunmo` 를 정의하는 곳이 없어 지금은 작동하지 않는다. 번들에는 안 들어가므로 성능 영향은 0 — 살릴지 지울지는 의도의 문제라 남겨뒀다 |

**패키징된 앱 검증이 공통으로 남아 있다.** minify 와 데드코드 제거 모두 dev 에서는 통과했지만, 이 작업의 주된 실패 모드는 패키징 후에만 드러난다 — 방해요소 tracker(`get-windows`)와 설정 저장(`electron-store`)을 실제 앱에서 확인해야 한다.

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
