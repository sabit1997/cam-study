import type { DistractionSegment, SessionSummary } from "@/types/tracking";

/**
 * 세션 → 서버로 보낼 (startAt, endAt) 청크 배열로 변환.
 *
 * 왜 여러 조각인가:
 * - 백엔드는 `POST /timer { startAt, endAt }` 하나만 안다. 딴짓 세그먼트를 필드로 표현하려면
 *   백엔드 스키마를 바꿔야 하는데, 이번 축은 백엔드 무변경을 원칙으로 삼는다(계획서 §2-D).
 * - focus 구간만 여러 번 POST하면 통계 페이지의 총합은 자연스럽게 correctedDurationSec와 같아진다.
 *
 * exclude 모드에서는 confirmed 세그먼트를 빼고 focus 구간만 반환.
 * keep 모드에서는 원본 startedAt~endedAt 하나만 반환.
 */

export interface TimeChunk {
  startAt: string; // ISO
  endAt: string; // ISO
}

export type CorrectionChoice = "keep" | "exclude";

export const buildChunks = (
  summary: SessionSummary,
  choice: CorrectionChoice
): TimeChunk[] => {
  if (choice === "keep") {
    return [{ startAt: summary.startedAt, endAt: summary.endedAt }];
  }

  // exclude: confirmed 세그먼트를 시각순으로 정렬한 뒤 그 사이의 focus 구간을 만든다.
  const confirmed = summary.segments
    .filter((s) => s.confirmed)
    .sort(compareByStartTime);

  if (confirmed.length === 0) {
    // 딴짓이 없으면 keep과 동일.
    return [{ startAt: summary.startedAt, endAt: summary.endedAt }];
  }

  const sessionStart = summary.startedAt;
  const sessionEnd = summary.endedAt;
  const chunks: TimeChunk[] = [];
  let cursor = sessionStart;

  for (const seg of confirmed) {
    // 세그먼트 시작 전까지가 focus. 세그먼트 시작이 cursor보다 뒤에 있어야 유효 청크.
    if (seg.startedAt > cursor) {
      chunks.push({ startAt: cursor, endAt: seg.startedAt });
    }
    // 다음 focus의 시작은 세그먼트 종료 시점.
    if (seg.endedAt > cursor) cursor = seg.endedAt;
  }
  // 마지막 세그먼트 종료 이후 세션 종료까지도 focus.
  if (sessionEnd > cursor) {
    chunks.push({ startAt: cursor, endAt: sessionEnd });
  }
  return chunks;
};

const compareByStartTime = (a: DistractionSegment, b: DistractionSegment): number =>
  a.startedAt.localeCompare(b.startedAt);

/**
 * 청크들의 총 지속 시간(초). exclude 모드 검증용으로도 쓴다.
 * summary.correctedDurationSec와 오차가 크면 서버 반영이 틀린 것.
 */
export const totalDurationSec = (chunks: TimeChunk[]): number =>
  chunks.reduce((sum, chunk) => {
    const start = new Date(chunk.startAt).getTime();
    const end = new Date(chunk.endAt).getTime();
    return sum + Math.max(0, Math.round((end - start) / 1000));
  }, 0);
