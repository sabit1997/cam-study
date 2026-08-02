import { useQuery } from "@tanstack/react-query";
import TimerService from "./service";

export const TIMER_QUERY_KEY = ["timer"] as const;
export const timerQueryKeys = {
  month: (year: number, month: number) => [...TIMER_QUERY_KEY, "month", year, month] as const,
  today: () => [...TIMER_QUERY_KEY, "today"] as const,
  goal: () => [...TIMER_QUERY_KEY, "goal"] as const,
  analytics: (year: number, month: number) => [...TIMER_QUERY_KEY, "analytics", year, month] as const,
};

export const useGetMonthTime = (year: number, month: number) => {
  return useQuery({
    queryKey: timerQueryKeys.month(year, month),
    queryFn: () => TimerService.fetchMonthTime(year, month),
    meta: {
      ERROR_SOURCE: "[월 별 타이머 기록 불러오기 실패]",
      SUCCESS_MESSAGE: "월 별 타이머 기록을 불러왔습니다.",
    },
  });
};

export const useGetTodayTime = () => {
  return useQuery({
    queryKey: timerQueryKeys.today(),
    queryFn: TimerService.fetchTodayTime,
    meta: {
      ERROR_SOURCE: "[오늘 타이머 기록 불러오기 실패]",
      SUCCESS_MESSAGE: "오늘 타이머 기록을 불러왔습니다.",
    },
  });
};

export const useGetTimerGoal = () => {
  return useQuery({
    queryKey: timerQueryKeys.goal(),
    queryFn: TimerService.fetchTimerGoal,
    meta: {
      ERROR_SOURCE: "[목표 시간 불러오기 실패]",
      SUCCESS_MESSAGE: "목표 시간을 불러왔습니다.",
    },
  });
};

export const useGetTimerAnalytics = (year: number, month: number) => {
  return useQuery({
    queryKey: timerQueryKeys.analytics(year, month),
    queryFn: () => TimerService.fetchTimerAnalytics(year, month),
    meta: {
      ERROR_SOURCE: "[타이머 통계 불러오기 실패]",
      SUCCESS_MESSAGE: "타이머 통계를 불러왔습니다.",
    },
    enabled: !!year && !!month,
    refetchOnMount: "always",
  });
};
