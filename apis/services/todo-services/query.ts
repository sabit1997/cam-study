import { useQuery } from "@tanstack/react-query";
import { fetchTodos, fetchAllTodos } from "./service";
import { TodoQueryParams } from "@/types/todos";

export const TODO_QUERY_KEY = ["todos"];

export const useGetTodos = (winId: number, queryParams?: TodoQueryParams) => {
  return useQuery({
    queryKey: [...TODO_QUERY_KEY, "window", winId, queryParams],
    queryFn: () => fetchTodos(winId, queryParams),
    enabled: !!winId,
    meta: {
      ERROR_SOURCE: "[투두 목록 불러오기 실패]",
      SUCCESS_MESSAGE: "투두 데이터를 불러왔습니다.",
    },
  });
};

export const useGetAllTodos = (queryParams?: TodoQueryParams) => {
  return useQuery({
    queryKey: [...TODO_QUERY_KEY, "global", queryParams],
    queryFn: () => fetchAllTodos(queryParams),
    meta: {
      ERROR_SOURCE: "[전체 투두 불러오기 실패]",
      SUCCESS_MESSAGE: "전체 투두를 불러왔습니다.",
    },
  });
};
