export const AuthEndPoints = {
  signup: () => "/auth/signup",
  login: () => "/auth/login",
};

export const WindowEndpoints = {
  getWindows: () => "/windows",
  createWindow: () => "/windows",
  patchWindow: (id: number) => `/windows/${id}`,
  deleteWindow: (id: number) => `/windows/${id}`,
};

export const TodosEndPoints = {
  getTodos: (id: number) => `/windows/${id}/todos`,
  addTodo: (id: number) => `/windows/${id}/todos`,
  deleteTodo: (winId: number, todoId: number) =>
    `/windows/${winId}/todos/${todoId}`,
  doneTodo: (winId: number, todoId: number) =>
    `/windows/${winId}/todos/${todoId}`,
};
