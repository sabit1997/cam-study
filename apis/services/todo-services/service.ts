// src/apis/services/todo/service.ts

import request from "@/apis/request";
import { AxiosMethod } from "@/types/axios";
import { TodosEndPoints } from "../config";
import {
  AddTodoVars,
  DeleteTodoVars,
  DoneTodoVars,
  Todos,
  UpdateTodoVars,
  TodoQueryParams,
} from "@/types/todos";
import { serverFetch } from "@/apis/serverFetch";

export default class TodoService {
  /** 새 투두 추가 */
  public static readonly addTodo = ({
    id,
    text,
  }: AddTodoVars): Promise<Todos> => {
    return request<Todos>({
      url: TodosEndPoints.addTodo(id),
      method: AxiosMethod.POST,
      data: { text },
    });
  };

  /** 개별 윈도우 내 투두 완료/미완료 토글 */
  public static readonly doneTodo = ({
    winId,
    todoId,
    done,
  }: DoneTodoVars): Promise<Todos> => {
    return request<Todos>({
      url: TodosEndPoints.doneTodo(winId, todoId),
      method: AxiosMethod.PATCH,
      data: { done: !done },
    });
  };

  /** 개별 윈도우 내 투두 삭제 */
  public static readonly deleteTodo = ({
    winId,
    todoId,
  }: DeleteTodoVars): Promise<void> => {
    return request<void>({
      url: TodosEndPoints.deleteTodo(winId, todoId),
      method: AxiosMethod.DELETE,
    });
  };

  /** 개별 윈도우 내 투두 텍스트 수정 */
  public static readonly updateTodo = ({
    winId,
    todoId,
    text,
  }: UpdateTodoVars): Promise<Todos> => {
    return request<Todos>({
      url: TodosEndPoints.updateTodoText(winId, todoId),
      method: AxiosMethod.PATCH,
      data: { text },
    });
  };

  /** 전체 투두(Global) 텍스트 수정 */
  public static readonly updateTodoGlobal = (
    todoId: number,
    text: string
  ): Promise<{ todoId: number; text: string }> => {
    return request<{ todoId: number; text: string }>({
      url: TodosEndPoints.updateTodoTextGlobal(todoId),
      method: AxiosMethod.PATCH,
      data: { text },
    });
  };

  /** 전체 투두(Global) 완료/미완료 토글 */
  public static readonly toggleDoneGlobal = (
    todoId: number,
    done: boolean
  ): Promise<{ todoId: number; done: boolean }> => {
    return request<{ todoId: number; done: boolean }>({
      url: TodosEndPoints.toggleDoneGlobal(todoId),
      method: AxiosMethod.PATCH,
      data: { done },
    });
  };

  /** 전체 투두(Global) 삭제 */
  public static readonly deleteTodoGlobal = (todoId: number): Promise<void> => {
    return request<void>({
      url: TodosEndPoints.deleteTodoGlobal(todoId),
      method: AxiosMethod.DELETE,
    });
  };
}

/** 개별 윈도우 투두 조회 */
export const fetchTodos = async (
  winId: number,
  query?: TodoQueryParams
): Promise<Todos[]> => {
  return await serverFetch(TodosEndPoints.getTodos(winId, query));
};

/** 전체 투두(Global) 조회 */
export const fetchAllTodos = async (
  query?: TodoQueryParams
): Promise<Todos[]> => {
  return await serverFetch(TodosEndPoints.getAllTodos(query));
};
