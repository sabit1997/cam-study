import { useMutation, useQueryClient } from "@tanstack/react-query";
import TodoService from "./service";
import {
  AddTodoVars,
  DeleteTodoVars,
  DoneTodoVars,
  Todos,
} from "@/types/todos";
import { TODO_QUERY_KEY } from "./query";

export const useAddTodo = () => {
  const queryClient = useQueryClient();

  return useMutation<Todos, Error, AddTodoVars>({
    mutationFn: ({ id, text }) => TodoService.addTodo({ id, text }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: [...TODO_QUERY_KEY, id],
      });
    },
    meta: {
      SUCCESS_MESSAGE: "투두가 추가되었습니다.",
      ERROR_SOURCE: "[투두 추가 실패]",
    },
  });
};

export const useDoneTodo = () => {
  const queryClient = useQueryClient();

  return useMutation<Todos, Error, DoneTodoVars>({
    mutationFn: ({ winId, todoId, done }) =>
      TodoService.doneTodo({ winId, todoId, done }),
    onSuccess: (_, { winId }) => {
      queryClient.invalidateQueries({
        queryKey: [...TODO_QUERY_KEY, winId],
      });
    },
    meta: {
      SUCCESS_MESSAGE: "투두 상태를 변경했습니다.",
      ERROR_SOURCE: "[투두 상태 변경 실패]",
    },
  });
};

export const useDeleteTodo = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteTodoVars>({
    mutationFn: ({ winId, todoId }) =>
      TodoService.deleteTodo({ winId, todoId }),
    onSuccess: (_, { winId }) => {
      queryClient.invalidateQueries({ queryKey: [...TODO_QUERY_KEY, winId] });
    },
    meta: {
      SUCCESS_MESSAGE: "투두가 삭제되었습니다.",
      ERROR_SOURCE: "[투두 삭제 실패]",
    },
  });
};
