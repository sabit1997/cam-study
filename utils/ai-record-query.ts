import TimerService from "@/apis/services/timer-services/service";

/**
 * 기록 질의 어댑터.
 *
 * LLM은 함수를 부르지 못하고 액션 JSON만 반환한다. AiActionRunner가 GET_* 액션을
 * 만나면 이 파일의 함수를 호출해 답을 만든다. LLM에게는 임의 SQL을 주지 않는다.
 *
 * ## 현재 데이터 소스
 * - 총 공부시간: 서버(TimerService.fetchMonthTime). 웹·데스크탑 모두 동작.
 * - 카테고리별 · 딴짓 패턴: 딴짓 감지 파이프라인(브랜치 2)의 tracker 세션 데이터가 필요하다.
 *   두 브랜치가 모두 병합되기 전에는 안내 메시지로 답한다. 필요한 IPC는 후속 커밋에서 노출한다.
 */

export interface TotalResult {
  totalSec: number;
  days: Array<{ date: string; sec: number }>;
}

export interface CategoryResult {
  study: number;
  distract: number;
  neutral: number;
  /** 데이터 없음을 사용자에게 알리기 위한 힌트 */
  incomplete?: string;
}

export interface DistractPatternBucket {
  bucket: string;
  sec: number;
}

export interface DistractPatternResult {
  buckets: DistractPatternBucket[];
  /** 데이터 없음을 사용자에게 알리기 위한 힌트 */
  incomplete?: string;
}

const iterMonths = (from: string, to: string): Array<{ year: number; month: number }> => {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const list: Array<{ year: number; month: number }> = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    list.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return list;
};

/**
 * from 이상 to 이하의 날짜만 담아 합산한다. 서버는 월 단위로만 조회 가능해서
 * 여러 달을 걸쳐 있으면 여러 번 호출한 뒤 클라이언트에서 필터링한다.
 */
export const getTotal = async (from: string, to: string): Promise<TotalResult> => {
  const months = iterMonths(from, to);
  const perMonth = await Promise.all(
    months.map((m) => TimerService.fetchMonthTime(m.year, m.month))
  );
  const days: Array<{ date: string; sec: number }> = [];
  let totalSec = 0;
  for (const res of perMonth) {
    for (const entry of res.entries) {
      if (entry.date >= from && entry.date <= to) {
        days.push({ date: entry.date, sec: entry.totalSeconds });
        totalSec += entry.totalSeconds;
      }
    }
  }
  // 날짜 오름차순으로 정렬해 UI가 안정적인 순서로 보여주게 한다.
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { totalSec, days };
};

/**
 * 카테고리(학습·딴짓·중립)별 시간 집계.
 *
 * 이 정보는 tracker 세션 세그먼트에서 나온다. tracker IPC(브랜치 2)가 아직 없거나
 * 웹에서 실행 중이면 study는 서버 총합으로 채우고 distract·neutral은 0, incomplete를 밝힌다.
 */
export const getByCategory = async (
  from: string,
  to: string
): Promise<CategoryResult> => {
  const { totalSec } = await getTotal(from, to);
  // 지금은 서버가 카테고리를 모르므로 study 합계만 얻을 수 있다.
  // 브랜치 2가 병합되면 tracker.getSessions로 실제 카테고리 분해를 채운다.
  return {
    study: totalSec,
    distract: 0,
    neutral: 0,
    incomplete:
      "카테고리별 시간은 데스크탑에서 딴짓 감지를 켜고 세션을 쌓은 뒤에 볼 수 있어요. 총 공부시간만 표시했어요.",
  };
};

/**
 * 딴짓 패턴 집계 (요일별·시간대별·일별).
 * 카테고리와 같은 이유로 tracker 데이터가 있어야 의미 있는 결과가 나온다.
 */
export const getDistractPattern = async (
  from: string,
  to: string,
  groupBy: "day" | "weekday" | "hour"
): Promise<DistractPatternResult> => {
  // 아직 tracker IPC가 노출되지 않아 인자만 받고 안내로 답한다.
  // 브랜치 2와 병합된 뒤 여기서 window.electronAPI?.tracker?.getSessions로 실제 데이터를 뽑는다.
  void from;
  void to;
  void groupBy;
  return {
    buckets: [],
    incomplete:
      "딴짓 패턴은 데스크탑에서 딴짓 감지를 켜고 세션을 쌓은 뒤에 볼 수 있어요.",
  };
};

// ── 포매터 (러너 → 답변 카드) ─────────────────────────────────────────

const formatSeconds = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  if (m > 0) return `${m}분`;
  return `${sec}초`;
};

export const formatTotalAnswer = (
  from: string,
  to: string,
  result: TotalResult
): string => {
  const range = from === to ? from : `${from}부터 ${to}까지`;
  if (result.totalSec === 0) {
    return `${range} 기록이 없어요.`;
  }
  const dayCount = result.days.length;
  const avg =
    dayCount > 0 ? formatSeconds(Math.round(result.totalSec / dayCount)) : "";
  const summary = `**${range} 총 공부시간: ${formatSeconds(result.totalSec)}**`;
  if (from === to) return summary;
  return `${summary}\n\n기록된 날 ${dayCount}일 · 하루 평균 ${avg}`;
};

export const formatCategoryAnswer = (
  from: string,
  to: string,
  result: CategoryResult
): string => {
  const range = from === to ? from : `${from}부터 ${to}까지`;
  const lines = [
    `**${range} 카테고리별 시간**`,
    `- 학습: ${formatSeconds(result.study)}`,
    `- 딴짓: ${formatSeconds(result.distract)}`,
    `- 중립: ${formatSeconds(result.neutral)}`,
  ];
  if (result.incomplete) lines.push("", result.incomplete);
  return lines.join("\n");
};

export const formatDistractPatternAnswer = (
  from: string,
  to: string,
  groupBy: "day" | "weekday" | "hour",
  result: DistractPatternResult
): string => {
  const range = from === to ? from : `${from}부터 ${to}까지`;
  const label = { day: "일별", weekday: "요일별", hour: "시간대별" }[groupBy];
  if (result.incomplete) {
    return `**${range} 딴짓 패턴(${label})**\n\n${result.incomplete}`;
  }
  const rows = result.buckets.map(
    (b) => `- ${b.bucket}: ${formatSeconds(b.sec)}`
  );
  return [`**${range} 딴짓 패턴(${label})**`, ...rows].join("\n");
};
