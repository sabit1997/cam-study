# 렌더 성능 계측 프로브

`src/dev/perfProbe.ts`는 리사이즈처럼 손으로 시간을 재기 어려운 구간에서, 특정 컴포넌트 트리가 몇 번 커밋되고 렌더에 얼마나 걸렸는지 자동으로 기록하는 개발용 도구다. React의 `<Profiler onRender>` 콜백을 그대로 활용하며, 프로덕션 빌드에는 영향을 주지 않는다.

## 동작 구조

```text
App
 └─ <Profiler id="App" onRender={onRenderProbe}>   ← src/App.tsx 최상단
      └─ 앱 전체
```

- `onRenderProbe(id, phase, actual)`: React가 커밋할 때마다 호출된다. `id`별로 커밋 수(`commits`)와 렌더 시간(`actuals`)을 누적한다. `mount` 단계는 리사이즈와 무관하므로 집계에서 제외한다.
- `resize` 이벤트 리스너: `import.meta.env.DEV`일 때만 등록되며, 이벤트 발생 횟수와 첫/마지막 발생 시각을 기록한다.
- `window.__perf`: 콘솔에서 바로 호출할 수 있도록 `reset`/`dump` 함수를 전역에 노출한다.

## 사용법

1. 개발 서버(`npm run dev:web`)를 켠 상태에서 브라우저(또는 Electron) 개발자도구 콘솔을 연다.
2. `__perf.reset()` 실행 → 지금부터 창을 드래그해 리사이즈한다.
3. 리사이즈가 끝나면 `__perf.dump()` 실행 → 아래 내용이 출력된다.
   - `[perf] 시작폭→끝폭px | resize N회 | N.NN초`
   - `console.table`로 `id`별 `commits`, `커밋/이벤트`, `total ms`, `max ms`

측정하고 싶은 컴포넌트가 따로 있으면 해당 위치에 `<Profiler id="이름" onRender={onRenderProbe}>`로 한 번 더 감싸면 같은 `window.__perf`에 같이 집계된다.

## 지표 해석

| 지표 | 의미 | 목표 |
| --- | --- | --- |
| 커밋/이벤트 | resize 이벤트 1회당 실제로 리렌더된 횟수 | Before는 1.0 근처, 최적화 후(After)는 0.05 이하 |
| total ms / max ms | 구간 전체·단일 커밋 최대 렌더 시간 | 낮을수록 좋음 |

## 관련 파일

| 파일 | 역할 |
| --- | --- |
| `src/dev/perfProbe.ts` | 수집(`onRenderProbe`)·출력(`reset`/`dump`)·전역 등록 |
| `src/App.tsx` | 앱 최상단에 `<Profiler>` 적용 (dev 모드에서만) |

## 주의점

- `import.meta.env.DEV`가 `false`인 프로덕션 빌드에서는 `<Profiler>`를 건너뛰고 `resize` 리스너도 등록하지 않으므로 실서비스 성능에 영향이 없다.
- `buckets`는 새로고침 전까지 계속 누적되므로, 새로운 측정을 시작하기 전에는 반드시 `__perf.reset()`을 먼저 호출한다.
