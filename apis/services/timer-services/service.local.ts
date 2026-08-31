import { getLocalKV } from "@/utils/local-store";
import {
  GetMonthTimeRes,
  GetTimerGoalRes,
  GetTodayTimeRes,
  PostTimeGoalReq,
  PostTimeReq,
} from "@/types/timer";
import { RecordData } from "@/types/record";
import { StatisticsdData } from "@/types/statistics";

// 로컬 타이머는 세션 배열, 목표 시간(시), 뽀모 사이클(날짜별)을 각각 별도 키에 담는다.
// 오늘/월별/통계는 조회 시점에 세션 배열을 스캔해서 즉석 계산한다.

const KEY_SESSIONS = "local:timer:sessions";
const KEY_GOAL = "local:timer:goal";
const KEY_POMO = "local:timer:pomo-cycles";

const LOCAL_USER_ID = "local";
const DEFAULT_GOAL_HOURS = 8;

interface LocalSession {
  startAt: string;
  endAt: string;
  seconds: number;
}

async function readSessions(): Promise<LocalSession[]> {
  const data = await getLocalKV().get<LocalSession[]>(KEY_SESSIONS);
  return Array.isArray(data) ? data : [];
}

async function writeSessions(list: LocalSession[]): Promise<void> {
  await getLocalKV().set(KEY_SESSIONS, list);
}

async function readGoalHours(): Promise<number> {
  const v = await getLocalKV().get<number>(KEY_GOAL);
  return typeof v === "number" && v > 0 ? v : DEFAULT_GOAL_HOURS;
}

async function readPomoMap(): Promise<Record<string, number>> {
  const v = await getLocalKV().get<Record<string, number>>(KEY_POMO);
  return v && typeof v === "object" ? v : {};
}

// 서버는 timezone 헤더로 로컬 일자를 계산한다. 우리는 그냥 로컬 시간 기준.
function localDateOf(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayLocalDate(): string {
  return localDateOf(new Date().toISOString());
}

// YYYY-MM-DD → 20260830 형태의 안정적 숫자 id.
function idFromDate(date: string): number {
  return Number(date.replace(/-/g, ""));
}

function secondsBetween(startIso: string, endIso: string): number {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  return Math.max(0, Math.round((e - s) / 1000));
}

function groupByDate(sessions: LocalSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    const key = localDateOf(s.startAt);
    map.set(key, (map.get(key) ?? 0) + s.seconds);
  }
  return map;
}

function recordFor(
  date: string,
  totalSeconds: number,
  goalHours: number
): RecordData {
  return {
    id: idFromDate(date),
    userId: LOCAL_USER_ID,
    date,
    totalSeconds,
    dailyHourGoal: goalHours,
  };
}

export default class TimerService {
  public static readonly postTime = async (
    data: PostTimeReq
  ): Promise<void> => {
    const list = await readSessions();
    list.push({
      startAt: data.startAt,
      endAt: data.endAt,
      seconds: secondsBetween(data.startAt, data.endAt),
    });
    await writeSessions(list);
  };

  public static readonly postTimerGoal = async (
    data: PostTimeGoalReq
  ): Promise<GetTimerGoalRes> => {
    await getLocalKV().set(KEY_GOAL, data.hour);
    return { hour: data.hour };
  };

  public static readonly fetchMonthTime = async (
    year: number,
    month: number
  ): Promise<GetMonthTimeRes> => {
    const [sessions, goalHours] = await Promise.all([
      readSessions(),
      readGoalHours(),
    ]);
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    const inMonth = sessions.filter((s) =>
      localDateOf(s.startAt).startsWith(monthPrefix)
    );
    const grouped = groupByDate(inMonth);
    const entries: RecordData[] = Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, seconds]) => recordFor(date, seconds, goalHours));
    const monthlyTotal = entries.reduce((n, r) => n + r.totalSeconds, 0);
    return { entries, monthlyTotal };
  };

  public static readonly fetchTimerGoal = async (): Promise<GetTimerGoalRes> => {
    return { hour: await readGoalHours() };
  };

  public static readonly fetchTimerAnalytics = async (
    year: number,
    month: number
  ): Promise<StatisticsdData> => {
    const [sessions, goalHours, pomoMap] = await Promise.all([
      readSessions(),
      readGoalHours(),
      readPomoMap(),
    ]);
    void pomoMap; // 통계는 지금 뽀모 사이클을 쓰지 않는다.
    const today = todayLocalDate();
    const goalSeconds = goalHours * 3600;

    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    // 이전 달 계산 (12→1월 롤오버).
    const prevY = month === 1 ? year - 1 : year;
    const prevM = month === 1 ? 12 : month - 1;
    const prevPrefix = `${prevY}-${String(prevM).padStart(2, "0")}`;

    let todayTotal = 0;
    let currentMonthTotal = 0;
    let previousMonthTotal = 0;
    const byDate = new Map<string, number>();
    // 통계 UI(components/my-stats-page.tsx)가 대문자 요일 키(MONDAY..SUNDAY)로
    // 조회하므로 그 계약에 맞춘다.
    const weekdayStats: Record<string, number> = {
      SUNDAY: 0,
      MONDAY: 0,
      TUESDAY: 0,
      WEDNESDAY: 0,
      THURSDAY: 0,
      FRIDAY: 0,
      SATURDAY: 0,
    };
    const weekdayNames = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ];

    for (const s of sessions) {
      const d = localDateOf(s.startAt);
      byDate.set(d, (byDate.get(d) ?? 0) + s.seconds);
      if (d === today) todayTotal += s.seconds;
      if (d.startsWith(monthPrefix)) {
        currentMonthTotal += s.seconds;
        const weekday = new Date(s.startAt).getDay();
        weekdayStats[weekdayNames[weekday]] += s.seconds;
      } else if (d.startsWith(prevPrefix)) {
        previousMonthTotal += s.seconds;
      }
    }

    const difference = currentMonthTotal - previousMonthTotal;
    const changeRate = previousMonthTotal
      ? Math.round((difference / previousMonthTotal) * 1000) / 10
      : 0;

    // 이번 달에서 total seconds가 가장 큰 날.
    let bestDate = "";
    let bestSeconds = 0;
    for (const [date, seconds] of byDate) {
      if (!date.startsWith(monthPrefix)) continue;
      if (seconds > bestSeconds) {
        bestSeconds = seconds;
        bestDate = date;
      }
    }

    const achievementRateToday = goalSeconds
      ? Math.round((todayTotal / goalSeconds) * 1000) / 10
      : 0;

    return {
      achievementRateToday,
      weekdayStats,
      monthComparison: {
        currentMonthTotal,
        previousMonthTotal,
        difference,
        changeRate,
      },
      bestFocusDay: {
        id: bestDate ? idFromDate(bestDate) : 0,
        userId: LOCAL_USER_ID,
        date: bestDate,
        totalSeconds: bestSeconds,
        dailyHourGoal: goalHours,
      },
    };
  };

  public static readonly fetchTodayTime = async (): Promise<GetTodayTimeRes> => {
    const [sessions, goalHours, pomoMap] = await Promise.all([
      readSessions(),
      readGoalHours(),
      readPomoMap(),
    ]);
    const today = todayLocalDate();
    const totalSeconds = sessions
      .filter((s) => localDateOf(s.startAt) === today)
      .reduce((n, s) => n + s.seconds, 0);
    return {
      dailyHourGoal: goalHours,
      date: today,
      goalInSeconds: goalHours * 3600,
      id: idFromDate(today),
      totalSeconds,
      userId: LOCAL_USER_ID,
      pomoCycles: pomoMap[today] ?? 0,
    };
  };

  public static readonly resetTime = async (date: string): Promise<void> => {
    const sessions = await readSessions();
    await writeSessions(
      sessions.filter((s) => localDateOf(s.startAt) !== date)
    );
    // 해당 날짜의 뽀모 사이클도 함께 리셋한다.
    const pomo = await readPomoMap();
    if (date in pomo) {
      delete pomo[date];
      await getLocalKV().set(KEY_POMO, pomo);
    }
  };

  public static readonly patchPomoCycles = async (
    cycles: number
  ): Promise<void> => {
    const pomo = await readPomoMap();
    pomo[todayLocalDate()] = cycles;
    await getLocalKV().set(KEY_POMO, pomo);
  };
}
