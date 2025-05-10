import request from "@/apis/request";
import { AddTodoVars, DeleteTodoVars, DoneTodoVars } from "@/types/todos";
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
}

export const fetchTodos = async (id: number) => {
  try {
    const data = await serverFetch(TodosEndPoints.getTodos(id));
    return data;
  } catch (error) {
    console.error("Failed to fetch todos:", error);
    throw error;
  }
};
