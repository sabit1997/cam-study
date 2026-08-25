/**
 * 딴짓 감지 파이프라인의 공용 타입.
 *
 * 이 모듈은 순수 타입만 담는다 — 렌더러·메인·설정 페이지가 모두 여기 import한다.
 * 실제 로직은 src-electron/tracker/, utils/session-correction.ts에 있다.
 */

export type AppLabel = "study" | "distract" | "neutral";

export const APP_LABELS: readonly AppLabel[] = [
  "study",
  "distract",
  "neutral",
] as const;

/**
 * OS별 앱 이름. get-windows가 반환하는 `owner.name`은 macOS와 Windows에서 다르다.
 * 예: VSCode는 macOS에서 "Code", Windows에서 "Code.exe".
 * 리눅스는 후속 지원 대상이라 optional.
 */
export interface AppIdentity {
  macOS?: string;
  windows?: string;
  linux?: string;
}

export interface AppPreset {
  /** 프리셋 고유 id — 사용자에게 보여주지 않는다. 오버라이드 인덱스 키로 쓴다. */
  id: string;
  label: AppLabel;
  names: AppIdentity;
  /** 설정 화면에서 사용자에게 보여줄 이름 (한글 우선) */
  displayName: string;
}

export interface DistractionSegment {
  /** uuid — 세그먼트 단위 revert/재적용용 */
  id: string;
  sessionId: string;
  /** get-windows가 준 raw 앱 이름. 오버라이드 조회 시 사용. */
  appName: string;
  label: AppLabel;
  /** ISO string */
  startedAt: string;
  /** ISO string */
  endedAt: string;
  /** 확정 시점 기준 지속 시간(초). suspend/lock 구간은 제외됨. */
  durationSec: number;
  /**
   * 5분 임계를 넘겨 "확정된 딴짓"인지.
   * false면 후보 단계에서 study 복귀로 자연 소멸한 세그먼트라 세션 요약에서 무시.
   */
  confirmed: boolean;
}

export interface SessionSummary {
  sessionId: string;
  /** ISO */
  startedAt: string;
  /** ISO */
  endedAt: string;
  /** 원본 = endedAt - startedAt (초). suspend 시간 포함. */
  rawDurationSec: number;
  /** confirmed=true 세그먼트 지속 시간 합. */
  distractionSec: number;
  /** rawDurationSec - distractionSec */
  correctedDurationSec: number;
  segments: DistractionSegment[];
}

/**
 * 세션 종료 시 사용자 응답.
 * - keep: 원본을 그대로 서버에 반영. distractionSec는 통계에 남지 않음.
 * - exclude: focus 구간만 반영. distractionSec가 총합에서 빠짐.
 */
export type CorrectionChoice = "keep" | "exclude";
