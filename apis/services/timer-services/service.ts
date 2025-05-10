import request from "@/apis/request";
import { TimerEndPoints } from "../config";
import { AxiosMethod } from "@/types/axios";
import {
  GetMonthTimeRes,
  GetTimerGoalRes,
  GetTodayTimeRes,
  PostTimeGoalReq,
  PostTimeReq,
} from "@/types/timer";
import { serverFetch } from "@/apis/serverFetch";
import { StatisticsdData } from "@/types/statistics";

export default class TimerService {
  public static readonly postTime = (data: PostTimeReq) => {
    return request({
      url: TimerEndPoints.postTime(),
      method: AxiosMethod.POST,
      data,
    });
  };

  public static readonly postTimerGoal = (
    data: PostTimeGoalReq
  ): Promise<GetTimerGoalRes> => {
    return request({
      url: TimerEndPoints.postTiemrGoal(),
      method: AxiosMethod.POST,
      data,
    });
  };
}

export const fetchMonthTime = async (
  year: number,
  month: number
): Promise<GetMonthTimeRes> => {
  try {
    const data = serverFetch(TimerEndPoints.getMonthTime(year, month));
    return data;
  } catch (error) {
    console.error("failed fetch month time", error);
    throw error;
  }
};

export const fetchTimerGoal = async (): Promise<GetTimerGoalRes> => {
  try {
    const data = serverFetch(TimerEndPoints.getTimerGoal());
    return data;
  } catch (error) {
    console.error("failed fetch timer goal", error);
    throw error;
  }
};

export const fetchTimerAnalytics = async (
  year: number,
  month: number
): Promise<StatisticsdData> => {
  try {
    const data = serverFetch(TimerEndPoints.getTimerAnalytics(year, month));
    return data;
  } catch (error) {
    console.error("failed fetch timer analytics", error);
    throw error;
  }
};

export const fetchTodayTime = async (): Promise<GetTodayTimeRes> => {
  try {
    const data = await serverFetch(TimerEndPoints.getTodayTime());
    return data;
  } catch (error) {
    console.error("Failed fetch today time:", error);
    throw error;
  }
};
