import { TodoQueryParams } from "@/types/todos";
import qs from "qs";

export const AuthEndPoints = {
  signup: () => `/auth/signup`,
  login: () => `/auth/login`,
};

export const WindowEndpoints = {
  getWindows: () => `/windows`,
  createWindow: () => `/windows`,
  patchWindow: (id: number) => `/windows/${id}`,
  deleteWindow: (id: number) => `/windows/${id}`,
};

export const TodosEndPoints = {
  getTodos: (id: number, query?: TodoQueryParams) => {
    const q = query ? `?${qs.stringify(query)}` : "";
    return `/windows/${id}/todos${q}`;
  },
  addTodo: (id: number) => `/windows/${id}/todos`,
  deleteTodo: (winId: number, todoId: number) =>
    `/windows/${winId}/todos/${todoId}`,
  doneTodo: (winId: number, todoId: number) =>
    `/windows/${winId}/todos/${todoId}`,
  updateTodoText: (winId: number, todoId: number) =>
    `/windows/${winId}/todos/${todoId}/text`,

  getAllTodos: (query?: TodoQueryParams) => {
    const q = query ? `?${qs.stringify(query)}` : "";
    return `/todos${q}`;
  },
  updateTodoTextGlobal: (todoId: number) => `/todos/${todoId}`,
  toggleDoneGlobal: (todoId: number) => `/todos/${todoId}/done`,
  deleteTodoGlobal: (todoId: number) => `/todos/${todoId}`,
};

export const TimerEndPoints = {
  postTime: () => `/timer`,
  getMonthTime: (year: number, month: number) =>
    `/timer?year=${year}&month=${month}`,
  getTodayTime: () => `/timer/today`,
  getTimerGoal: () => `/timer/goal`,
  postTimerGoal: () => `/timer/goal`,
  getTimerAnalytics: (year: number, month: number) =>
    `/timer/analytics?year=${year}&month=${month}`,
};
