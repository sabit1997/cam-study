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

export default class TodoService {
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

  public static readonly deleteTodo = ({
    winId,
    todoId,
  }: DeleteTodoVars): Promise<void> => {
    return request<void>({
      url: TodosEndPoints.deleteTodo(winId, todoId),
      method: AxiosMethod.DELETE,
    });
  };

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

  public static readonly deleteTodoGlobal = (todoId: number): Promise<void> => {
    return request<void>({
      url: TodosEndPoints.deleteTodoGlobal(todoId),
      method: AxiosMethod.DELETE,
    });
  };

  public static readonly fetchTodos = (
    winId: number,
    query?: TodoQueryParams
  ): Promise<Todos[]> => {
    return request({
      url: TodosEndPoints.getTodos(winId, query),
      method: AxiosMethod.GET,
    });
  };

  public static readonly fetchAllTodos = (
    query?: TodoQueryParams
  ): Promise<Todos[]> => {
    return request({
      url: TodosEndPoints.getAllTodos(query),
      method: AxiosMethod.GET,
    });
  };
}
