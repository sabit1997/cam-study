"use client";

import { useGetTodos } from "@/apis/services/todo-services/query";
import AddTodo from "./add-todo";
import { Window } from "@/types/windows";
import {
  useDeleteTodo,
  useDoneTodo,
} from "@/apis/services/todo-services/mutation";
import { FaRegTrashAlt } from "react-icons/fa";

interface TodosProps {
  window: Window;
}

const Todos = ({ window }: TodosProps) => {
  const { data: todos = [] } = useGetTodos(window.id);
  const { mutate: deleteTodo } = useDeleteTodo();
  const { mutate: doneTodo } = useDoneTodo();
  return (
    <div className="p-4 flex flex-col gap-2">
      <AddTodo window={window} />
      <ul>
        {todos.length > 0 &&
          todos.map((todo) => (
            <li
              key={todo.id}
              onClick={() =>
                doneTodo({
                  winId: window.id,
                  todoId: todo.id,
                  done: !todo.done,
                })
              }
              className={`
  flex items-center px-3 py-2 mb-[6px] border rounded-md cursor-pointer
  ${todo.done ? "bg-[#255f38] text-white" : "text-black border-[#ccc] relative"}
`}
            >
              <span className="mr-2">{todo.done ? "✅" : "⬜️"}</span>
              {todo.text}
              <button
                type="button"
                className="rounded-full bg-red-500 p-1 absolute right-2"
                onClick={() =>
                  deleteTodo({ winId: window.id, todoId: todo.id })
                }
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
