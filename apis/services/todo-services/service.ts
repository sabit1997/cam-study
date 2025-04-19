import request from "@/apis/request";
import {
  AddTodoVars,
  DeleteTodoVars,
  DoneTodoVars,
  Todos,
} from "@/types/todos";
import { TodosEndPoints } from "../config";
import { AxiosMethod } from "@/types/axios";

export default class TodoService {
  public static readonly getTodos = (id: number): Promise<Todos[]> => {
    return request({
      url: TodosEndPoints.getTodos(id),
      method: AxiosMethod.GET,
    });
  };

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
}
