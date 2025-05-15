export interface Todos {
  id: number;
  text: string;
  done: boolean;
  createdAt: string;
}

export type AddTodoVars = {
  id: number;
  text: string;
};

export type DeleteTodoVars = {
  winId: number;
  todoId: number;
};

export type DoneTodoVars = DeleteTodoVars & {
  done: boolean;
};

export type UpdateTodoVars = DeleteTodoVars & {
  text: string;
};

export interface TodoQueryParams {
  date?: string;
  done?: boolean;
  order?: "asc" | "desc";
}
