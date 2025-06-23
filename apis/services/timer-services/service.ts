import {
  GetMonthTimeRes,
  GetTimerGoalRes,
  GetTodayTimeRes,
  PostTimeGoalReq,
  PostTimeReq,
} from "@/types/timer";
import { StatisticsdData } from "@/types/statistics";
import request from "@/apis/request";
import { TimerEndPoints } from "../config";
import { AxiosMethod } from "@/types/axios";

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
      url: TimerEndPoints.postTimerGoal(),
      method: AxiosMethod.POST,
      data,
    });
  };

  public static readonly fetchMonthTime = (
    year: number,
    month: number
  ): Promise<GetMonthTimeRes> => {
    return request({
      url: TimerEndPoints.getMonthTime(year, month),
      method: AxiosMethod.GET,
    });
  };

  public static readonly fetchTimerGoal = (): Promise<GetTimerGoalRes> => {
    return request({
      url: TimerEndPoints.getTimerGoal(),
      method: AxiosMethod.GET,
    });
  };

  public static readonly fetchTimerAnalytics = (
    year: number,
    month: number
  ): Promise<StatisticsdData> => {
    return request({
      url: TimerEndPoints.getTimerAnalytics(year, month),
      method: AxiosMethod.GET,
    });
  };

  public static readonly fetchTodayTime = (): Promise<GetTodayTimeRes> => {
    return request({
      url: TimerEndPoints.getTodayTime(),
      method: AxiosMethod.GET,
    });
  };

  public static readonly resetTime = (date: string): Promise<void> => {
    return request({
      url: TimerEndPoints.resetTime(date),
      method: AxiosMethod.DELETE,
    });
  };
}
