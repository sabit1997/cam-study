import { useQuery } from "@tanstack/react-query";
import TodoService from "./service";

export const TODO_QUERY_KEY = ["todos"];

export const useGetTodos = (id: number) => {
  return useQuery({
    queryKey: [...TODO_QUERY_KEY, id],
    queryFn: () => TodoService.getTodos(id),
    meta: {
      ERROR_SOURCE: "[투두 목록 불러오기 실패]",
      SUCCESS_MESSAGE: "투두 데이터를 불러왔습니다.",
    },
  });
};
