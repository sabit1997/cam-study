import request from "@/apis/request";
import { TimerEndPoints } from "../config";
import { AxiosMethod } from "@/types/axios";
import {
  GetMonthTimeRes,
  GetTimerGoalRes,
  PostTimeGoalReq,
  PostTimeReq,
} from "@/types/timer";
import { StatisticsdData } from "@/types/statistics";
import { serverFetch } from "@/apis/serverFetch";

export default class TimerService {
  public static readonly postTime = (data: PostTimeReq) => {
    return request({
      url: TimerEndPoints.postTime(),
      method: AxiosMethod.POST,
      data,
    });
  };

  public static readonly getMonthTime = (
    year: number,
    month: number
  ): Promise<GetMonthTimeRes> => {
    return request({
      url: TimerEndPoints.getMonthTime(year, month),
      method: AxiosMethod.GET,
    });
  };

  public static readonly getTimerGoal = (): Promise<GetTimerGoalRes> => {
    return request({
      url: TimerEndPoints.getTimerGoal(),
      method: AxiosMethod.GET,
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

  public static readonly getTimerAnalytics = (
    year: number,
    month: number
  ): Promise<StatisticsdData> => {
    return request({
      url: TimerEndPoints.getTimerAnalytics(year, month),
      method: AxiosMethod.GET,
    });
  };
}

export const fetchTodayTime = async () => {
  try {
    const data = await serverFetch(TimerEndPoints.getTodayTime());
    console.log("today time:", data);
    return data;
  } catch (error) {
    console.error("Failed fetch today time:", error);
    throw error;
  }
};
