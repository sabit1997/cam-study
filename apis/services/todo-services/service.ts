import { UpdateTodoVars, TodoQueryParams } from "../../../types/todos";
import request from "@/apis/request";
import {
  AddTodoVars,
  DeleteTodoVars,
  DoneTodoVars,
  Todos,
} from "@/types/todos";
import { TodosEndPoints } from "../config";
import { AxiosMethod } from "@/types/axios";
import { serverFetch } from "@/apis/serverFetch";

export default class TodoService {
  public static readonly addTodo = ({ id, text }: AddTodoVars) => {
    return request({
      url: TodosEndPoints.addTodo(id),
      method: AxiosMethod.POST,
      data: { text },
    });
  };

  public static readonly doneTodo = ({ winId, todoId, done }: DoneTodoVars) => {
    return request({
      url: TodosEndPoints.doneTodo(winId, todoId),
      method: AxiosMethod.PATCH,
      data: { done: !done },
    });
  };

  public static readonly deleteTodo = ({ winId, todoId }: DeleteTodoVars) => {
    return request({
      url: TodosEndPoints.deleteTodo(winId, todoId),
      method: AxiosMethod.DELETE,
    });
  };

  public static readonly updateTodo = ({
    winId,
    todoId,
    text,
  }: UpdateTodoVars) => {
    return request({
      url: TodosEndPoints.updateTodoText(winId, todoId),
      method: AxiosMethod.PATCH,
      data: { text },
    });
  };

  public static readonly updateTodoGlobal = (todoId: number, text: string) => {
    return request({
      url: TodosEndPoints.updateTodoTextGlobal(todoId),
      method: AxiosMethod.PATCH,
      data: { text },
    });
  };

  public static readonly toggleDoneGlobal = (todoId: number, done: boolean) => {
    return request({
      url: TodosEndPoints.toggleDoneGlobal(todoId),
      method: AxiosMethod.PATCH,
      data: { done },
    });
  };

  public static readonly deleteTodoGlobal = (todoId: number) => {
    return request({
      url: TodosEndPoints.deleteTodoGlobal(todoId),
      method: AxiosMethod.DELETE,
    });
  };
}

export const fetchTodos = async (
  winId: number,
  query?: TodoQueryParams
): Promise<Todos[]> => {
  return await serverFetch(TodosEndPoints.getTodos(winId, query));
};

export const fetchAllTodos = async (
  query?: TodoQueryParams
): Promise<Todos[]> => {
  return await serverFetch(TodosEndPoints.getAllTodos(query));
};
