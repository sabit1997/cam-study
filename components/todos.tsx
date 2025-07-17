"use client";

import { useGetTodos } from "@/apis/services/todo-services/query";
import AddTodo from "./add-todo";
import { Window } from "@/types/windows";
import {
  useDeleteTodo,
  useDoneTodo,
} from "@/apis/services/todo-services/mutation";
import { FaRegTrashAlt } from "react-icons/fa";
import { DeleteTodoVars, DoneTodoVars } from "@/types/todos";
import { useState } from "react";

const Todos = ({ window }: { window: Window }) => {
  const [done, setDone] = useState<boolean | undefined>(undefined);
  const [date, setDate] = useState("");
  const [order, setOrder] = useState<"asc" | "desc">("asc");

  const toggleDoneFilter = () => {
    setDone((prev) =>
      prev === undefined ? true : prev === true ? false : undefined
    );
  };

  const toggleDateFilter = () => {
    const today = new Date().toLocaleDateString("en-CA");
    setDate((prev) => (prev ? "" : today));
  };

  const toggleOrder = () => {
    setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const { data: todos = [] } = useGetTodos(window.id, {
    ...(date && { date }),
    ...(done !== undefined && { done }),
    order,
  });

  const { mutate: deleteTodo, isPending: isDeletePending } = useDeleteTodo();
  const { mutate: doneTodo, isPending: isDonePending } = useDoneTodo();

  const handleDone = ({ winId, todoId, done }: DoneTodoVars) => {
    if (isDonePending) return;
    doneTodo({ winId, todoId, done });
  };

  const handleDelete = ({ winId, todoId }: DeleteTodoVars) => {
    if (isDeletePending) return;
    deleteTodo({ winId, todoId });
  };

  return (
    <div className="pb-4 pt-1 px-4 flex flex-col gap-2 h-full">
      <AddTodo window={window} />

      <div className="flex gap-2 items-center mb-1 text-sm">
        <span className="text-[var(--color-dark)] font-semibold">Filter:</span>
        <button
          type="button"
          className={`todo-filter-btn ${date ? "selected" : ""}`}
          onClick={toggleDateFilter}
        >
          TODAY
        </button>
        <button
          type="button"
          className={`todo-filter-btn ${done !== undefined ? "selected" : ""}`}
          onClick={toggleDoneFilter}
        >
          {done === undefined ? "ALL" : done ? "DONE" : "TODO"}
        </button>
        <button
          type="button"
          className="todo-filter-btn selected"
          onClick={toggleOrder}
        >
          {order === "asc" ? "ASC" : "DESC"}
        </button>
      </div>

      <ul className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-primary [&::-webkit-scrollbar-thumb]:bg-dark [&::-webkit-scrollbar-thumb]:rounded-lg [scrollbar-width:thin] [scrollbar-color:var(--color-dark)_var(--color-primary)]">
        {todos.length > 0 &&
          todos.map((todo) => (
            <li
              key={todo.id}
              onClick={() =>
                handleDone({
                  winId: window.id,
                  todoId: todo.id,
                  done: !!todo.done,
                })
              }
              className={`
                flex items-center pl-3 pr-9 py-2 mb-[6px] border rounded-md cursor-pointer relative
                ${
                  todo.done
                    ? "bg-dark text-[var(--text-selected)]"
                    : "text-[var(--text-primary)] border-[#ccc]"
                }
              `}
            >
              <span className="mr-2">{todo.done ? "✅" : "⬜️"}</span>
              <p className="overflow-ellipsis overflow-hidden">{todo.text}</p>
              <button
                disabled={isDeletePending}
                type="button"
                className="rounded-full bg-red-500 p-1 absolute right-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete({ winId: window.id, todoId: todo.id });
                }}
              >
                <FaRegTrashAlt className="text-white" />
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
};

export default Todos;
