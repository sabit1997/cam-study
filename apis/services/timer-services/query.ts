import { useQuery } from "@tanstack/react-query";
import TimerService from "./service";

export const TIMER_QUERY_KEY = ["timer"];

export const useGetMonthTime = (year: number, month: number) => {
  return useQuery({
    queryKey: [...TIMER_QUERY_KEY, year, month],
    queryFn: () => TimerService.fetchMonthTime(year, month),
    meta: {
      ERROR_SOURCE: "[월 별 타이머 기록 불러오기 실패]",
      SUCCESS_MESSAGE: "월 별 타이머 기록을 불러왔습니다.",
    },
  });
};

export const useGetTodayTime = () => {
  return useQuery({
    queryKey: TIMER_QUERY_KEY,
    queryFn: TimerService.fetchTodayTime,
    meta: {
      ERROR_SOURCE: "[오늘 타이머 기록 불러오기 실패]",
      SUCCESS_MESSAGE: "오늘 타이머 기록을 불러왔습니다.",
    },
  });
};

export const useGetTimerGoal = () => {
  return useQuery({
    queryKey: TIMER_QUERY_KEY,
    queryFn: TimerService.fetchTimerGoal,
    meta: {
      ERROR_SOURCE: "[목표 시간 불러오기 실패]",
      SUCCESS_MESSAGE: "목표 시간을 불러왔습니다.",
    },
  });
};

export const useGetTimerAnalytics = (year: number, month: number) => {
  return useQuery({
    queryKey: [...TIMER_QUERY_KEY, year, month],
    queryFn: () => TimerService.fetchTimerAnalytics(year, month),
    meta: {
      ERROR_SOURCE: "[타이머 통계 불러오기 실패]",
      SUCCESS_MESSAGE: "타이머 통계를 불러왔습니다.",
    },
  });
};
