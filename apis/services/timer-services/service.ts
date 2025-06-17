import {
  GetMonthTimeRes,
  GetTimerGoalRes,
  GetTodayTimeRes,
  PostTimeGoalReq,
  PostTimeReq,
} from "@/types/timer";
import { StatisticsdData } from "@/types/statistics";
import { serverFetch } from "@/apis/serverFetch";
import request from "@/apis/request";
import { TimerEndPoints } from "../config";
import { AxiosMethod } from "@/types/axios";

export default class TimerService {
  public static readonly postTime = (data: PostTimeReq) =>
    request({ url: TimerEndPoints.postTime(), method: AxiosMethod.POST, data });

  public static readonly postTimerGoal = (data: PostTimeGoalReq) =>
    request<GetTimerGoalRes>({
      url: TimerEndPoints.postTimerGoal(),
      method: AxiosMethod.POST,
      data,
    });
}

export const fetchMonthTime = async (
  year: number,
  month: number
): Promise<GetMonthTimeRes> => {
  const data = await serverFetch<GetMonthTimeRes>(
    TimerEndPoints.getMonthTime(year, month),
    { suppressStatus: [401] }
  );
  if (data === null) {
    return { entries: [], monthlyTotal: 0 };
  }
  return data;
};

export const fetchTimerGoal = async (): Promise<GetTimerGoalRes> => {
  const data = await serverFetch<GetTimerGoalRes>(
    TimerEndPoints.getTimerGoal(),
    { suppressStatus: [401] }
  );
  if (data === null) {
    return { hour: 0 };
  }
  return data;
};

export const fetchTimerAnalytics = async (
  year: number,
  month: number
): Promise<StatisticsdData> => {
  const data = await serverFetch<StatisticsdData>(
    TimerEndPoints.getTimerAnalytics(year, month),
    { suppressStatus: [401] }
  );
  if (data === null) {
    return {
      achievementRateToday: 0,
      weekdayStats: {
        Monday: 0,
        Tuesday: 0,
        Wednesday: 0,
        Thursday: 0,
        Friday: 0,
        Saturday: 0,
        Sunday: 0,
      },
      monthComparison: {
        currentMonthTotal: 0,
        previousMonthTotal: 0,
        difference: 0,
        changeRate: 0,
      },
      bestFocusDay: {
        id: 0,
        userId: "",
        date: "",
        totalSeconds: 0,
        dailyHourGoal: 0,
      },
    };
  }
  return data;
};

export const fetchTodayTime = async (): Promise<GetTodayTimeRes> => {
  const data = await serverFetch<GetTodayTimeRes>(
    TimerEndPoints.getTodayTime(),
    { suppressStatus: [401] }
  );
  if (data === null) {
    return {
      dailyHourGoal: 0,
      date: "",
      goalInSeconds: 0,
      id: 0,
      totalSeconds: 0,
      userId: "",
    };
  }
  return data;
};
