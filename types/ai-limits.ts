/**
 * 액션 값의 허용 범위.
 *
 * 서버(프롬프트)와 클라이언트(2단계 검증)가 같은 숫자를 봐야 해서 별도 파일로 둔다.
 * 이 파일은 브라우저 전용 코드를 import하지 않는다 — Vite 설정과 서버리스 함수에서도 읽힌다.
 */
export const AI_LIMITS = {
  /** 배치 전체 액션 수 */
  MAX_ACTIONS: 20,
  /** 1회 최대 창 생성 개수 — 화면이 창으로 뒤덮이는 것을 막는다 */
  MAX_WINDOWS: 4,
  /** 1회 최대 Todo 개수 — 서버 스팸을 막는다 */
  MAX_TODOS: 10,
  /** Todo 한 줄 길이 — 레이아웃 붕괴를 막는다 */
  MAX_TODO_LENGTH: 200,
  /** 포모도로 분 단위 범위 — 9999분 타이머로 UI가 깨지는 것을 막는다 */
  MIN_MINUTES: 1,
  MAX_MINUTES: 180,
} as const;
