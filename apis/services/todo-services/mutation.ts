import { useMutation, useQueryClient } from "@tanstack/react-query";
import TodoService from "./service";
import {
  AddTodoVars,
  DeleteTodoVars,
  DoneTodoVars,
  Todos,
  UpdateTodoVars,
} from "@/types/todos";
import { TODO_QUERY_KEY } from "./query";

export const useAddTodo = () => {
  const queryClient = useQueryClient();
  return useMutation<Todos, Error, AddTodoVars>({
    mutationFn: ({ id, text }) => TodoService.addTodo({ id, text }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({
        queryKey: [...TODO_QUERY_KEY, "window", id],
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
        queryKey: [...TODO_QUERY_KEY, "window", winId],
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
      queryClient.invalidateQueries({
        queryKey: [...TODO_QUERY_KEY, "window", winId],
      });
    },
    meta: {
      SUCCESS_MESSAGE: "투두가 삭제되었습니다.",
      ERROR_SOURCE: "[투두 삭제 실패]",
    },
  });
};

export const useUpdateTodo = () => {
  const queryClient = useQueryClient();
  return useMutation<Todos, Error, UpdateTodoVars>({
    mutationFn: ({ winId, todoId, text }) =>
      TodoService.updateTodo({ winId, todoId, text }),
    onSuccess: (_, { winId }) => {
      queryClient.invalidateQueries({
        queryKey: [...TODO_QUERY_KEY, "window", winId],
      });
    },
    meta: {
      SUCCESS_MESSAGE: "투두 내용을 수정했습니다.",
      ERROR_SOURCE: "[투두 수정 실패]",
    },
  });
};

export const useUpdateTodoGlobal = () => {
  const queryClient = useQueryClient();
  return useMutation<
    { todoId: number; text: string },
    Error,
    { todoId: number; text: string }
  >({
    mutationFn: ({ todoId, text }) =>
      TodoService.updateTodoGlobal(todoId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...TODO_QUERY_KEY, "global"],
      });
    },
    meta: {
      SUCCESS_MESSAGE: "투두 내용을 수정했습니다.",
      ERROR_SOURCE: "[투두 수정 실패]",
    },
  });
};

export const useToggleDoneGlobal = () => {
  const queryClient = useQueryClient();
  return useMutation<
    { todoId: number; done: boolean },
    Error,
    { todoId: number; done: boolean }
  >({
    mutationFn: ({ todoId, done }) =>
      TodoService.toggleDoneGlobal(todoId, done),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...TODO_QUERY_KEY, "global"],
      });
    },
    meta: {
      SUCCESS_MESSAGE: "투두 상태를 변경했습니다.",
      ERROR_SOURCE: "[투두 상태 변경 실패]",
    },
  });
};

export const useDeleteTodoGlobal = () => {
  const queryClient = useQueryClient();
  return useMutation<number, Error, number>({
    mutationFn: (todoId) => TodoService.deleteTodoGlobal(todoId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...TODO_QUERY_KEY, "global"],
      });
    },
    meta: {
      SUCCESS_MESSAGE: "투두가 삭제되었습니다.",
      ERROR_SOURCE: "[투두 삭제 실패]",
    },
  });
};
