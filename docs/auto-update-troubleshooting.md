# 자동 업데이트 트러블슈팅 기록

## 개요

electron-updater 기반 자동 업데이트(GitHub Releases)를 운영하면서 발생한 문제들과 해결 과정을 정리한 문서.

---

## 문제 1: 업데이트 실패 시 UI가 멈춤

### 증상

업데이트 중 에러가 발생해도 UI가 "백그라운드에서 다운로드 중..." 상태에서 영원히 멈춰 있음. 사용자는 실패 여부를 알 수 없음.

### 원인

`autoUpdater.on("error")` 핸들러가 `console.error`만 하고 렌더러로 이벤트를 전달하지 않았음.

```ts
// 수정 전
autoUpdater.on("error", (err) => {
  console.error("Auto-updater error:", err.message);
});
```

### 해결

에러 이벤트를 렌더러로 IPC 전송 + `cachedPercent` 초기화.

```ts
// 수정 후 (src-electron/main.ts)
autoUpdater.on("error", (err) => {
  console.error("Auto-updater error:", err.message);
  cachedPercent = null;
  mainWindow?.webContents.send("update:error", err.message);
});
```

`update-notifier.tsx`에 `error` 단계 UI 추가:

```tsx
{state.phase === "error" && (
  <div className="flex items-center gap-3">
    <LuX size={16} className="text-red-400 flex-shrink-0" />
    <div className="flex-1 leading-snug">
      <p className="font-semibold text-[#3d6b28] text-xs">업데이트 실패</p>
      <p className="text-[11px] text-[#6a9f50]">
        <a href="/download" className="underline hover:text-[#3d6b28]">
          수동으로 다운로드
        </a>
        하거나 나중에 다시 시도해 주세요
      </p>
    </div>
    <button onClick={() => setDismissed(true)} ...>
      <LuX size={13} />
    </button>
  </div>
)}
```

---

## 문제 2: 다운로드 진행률 복구 불가

### 증상

다운로드 중에 렌더러가 재마운트되면(페이지 이동 등) 진행률이 사라지고 "업데이트 없음" 상태로 보임.

### 원인

`ipcMain.handle("update:check-state")` 핸들러가 `downloading` 단계를 처리하지 않았음. `cachedPercent` 변수 자체가 없었음.

### 해결

```ts
// src-electron/main.ts
let cachedPercent: number | null = null;

autoUpdater.on("download-progress", (progress) => {
  cachedPercent = Math.floor(progress.percent);
  mainWindow?.webContents.send("update:progress", cachedPercent);
});

autoUpdater.on("update-downloaded", () => {
  updateDownloaded = true;
  cachedPercent = null; // 완료 시 초기화
  mainWindow?.webContents.send("update:downloaded");
});

ipcMain.handle("update:check-state", () => {
  if (updateDownloaded) return { phase: "ready" };
  if (cachedPercent !== null) return { phase: "downloading", percent: cachedPercent }; // 추가
  if (cachedUpdateInfo) return { phase: "available", ...cachedUpdateInfo };
  return null;
});
```

---

## 문제 3: macOS에서 `autoInstallOnAppQuit` 충돌

### 증상

macOS에서 다운로드 단계부터 에러 발생 가능성. (ad-hoc 서명 앱 + Squirrel.Mac 충돌)

### 원인

`autoInstallOnAppQuit = true`는 내부적으로 Squirrel.Mac을 통해 설치를 시도하는데, 코드서명이 없는 앱에서는 실패함. 이 프로젝트는 `installMacUpdate()`로 ZIP을 직접 추출하는 커스텀 설치 로직을 사용하므로 이 옵션이 불필요하고 충돌을 유발.

### 해결

```ts
autoUpdater.autoInstallOnAppQuit = false; // Squirrel.Mac 우회
```

---

## 문제 4: zip 파일명 불일치로 404 에러

### 증상

```
Error: Cannot find latest-mac.yml ... HttpError: 404
```

또는

```
404: cam-study-1.0.13-arm64-mac.zip
```

실제 업로드된 파일: `-1.0.13-arm64-mac.zip` (앞에 이름 없음)

### 원인

`productName`이 `"외요의 캠스터디"` (한국어)라서 electron-builder가 zip 파일명을 생성할 때 한국어 문자가 탈락하여 `-1.0.13-arm64-mac.zip`이 됨. 그런데 `latest-mac.yml` 내부에는 npm `name` 필드(`cam-study`)를 사용해 `cam-study-1.0.13-arm64-mac.zip`으로 참조 → 파일명 불일치 → 404.

### 해결

`package.json` 빌드 설정에 `artifactName`을 ASCII로 명시:

```json
"mac": {
  "artifactName": "cam-study-${version}-${arch}-mac.${ext}",
  ...
}
```

이렇게 하면 zip 파일명과 `latest-mac.yml`이 참조하는 이름이 항상 동일하게 `cam-study-1.0.14-arm64-mac.zip`으로 생성됨.

---

## 문제 5: GitHub Actions mac 빌드 실패 (macOS 26)

### 증상

```
X build-mac in 5s
X Failed to load actions/checkout/v4/action.yml
System.ArgumentException: Unexpected type '' encountered while reading 'action manifest root'.
```

CI 워크플로우 전체는 `success`로 표시되지만 mac 아티팩트가 릴리즈에 없음. (`continue-on-error: true` 때문에 실패가 감춰짐)

### 원인

2026년 6월 15일부터 `macos-latest` 러너가 macOS 26 (Tahoe)으로 전환됨. macOS 26 환경에서 `actions/checkout@v4` YAML 로딩 실패. 빌드 자체가 시작도 못 함.

참고: [GitHub Actions runner images #14167](https://github.com/actions/runner-images/issues/14167)

### 해결

`release.yml`에서 러너를 안정 버전으로 고정:

```yaml
# 수정 전
build-mac:
  runs-on: macos-latest

# 수정 후
build-mac:
  runs-on: macos-15
```

### 주의

이후 `macos-15` 지원이 종료되면 `macos-16` 등으로 업데이트 필요. `macos-latest`는 예고 없이 바뀌므로 CI가 중요한 프로젝트에서는 버전 고정 권장.

---

## electron-updater 업데이트 흐름 요약

```
앱 시작 (5초 후)
  └─ autoUpdater.checkForUpdates()
       ├─ GitHub에서 latest-mac.yml 다운로드
       │    └─ 404이면 → "error" 이벤트 발생
       ├─ 현재 버전과 비교
       │    └─ 최신 버전 없으면 → 종료
       └─ update-available 이벤트
            └─ autoDownload=true이면 자동 다운로드 시작
                 ├─ download-progress 이벤트 (0~100%)
                 └─ update-downloaded 이벤트
                      └─ 사용자가 "재시작" 클릭
                           └─ installMacUpdate() (커스텀 ZIP 교체)
```

## 릴리즈 절차 (현재 기준)

1. 코드 수정
2. `package.json` version 올리기
3. `git commit` → `git push origin main`
4. `git tag v{버전}` → `git push origin v{버전}`
5. GitHub Actions가 자동으로 mac/win 빌드 후 릴리즈 업로드 (약 8~10분)
6. Actions 탭에서 `build-mac` 잡 성공 여부 반드시 확인

> mac 빌드는 `continue-on-error: true`라서 실패해도 전체 워크플로우가 성공으로 보임. 릴리즈에 `latest-mac.yml`이 있는지 직접 확인해야 함.
