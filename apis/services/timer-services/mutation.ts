import { useMutation, useQueryClient } from "@tanstack/react-query";
import TimerService from "./service";
import { TIMER_QUERY_KEY } from "./query";

export const usePostTime = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: TimerService.postTime,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TIMER_QUERY_KEY });
    },
    meta: {
      SUCCESS_MESSAGE: "시간 기록이 되었습니다.",
      ERROR_SOURCE: "[시간 기록 실패]",
    },
  });
};

export const usePostTimeGoal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: TimerService.postTimerGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TIMER_QUERY_KEY });
    },
    meta: {
      SUCCESS_MESSAGE: "목표 시간이 설정되었습니다.",
      ERROR_SOURCE: "[목표 시간 설정 실패]",
    },
  });
};

export const useResetTime = (date: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => TimerService.resetTime(date),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...TIMER_QUERY_KEY, "today"],
      });
    },
    meta: {
      SUCCESS_MESSAGE: "타이머가 리셋 되었습니다.",
      ERROR_SOURCE: "[타이머 리셋 실패]",
    },
  });
};
