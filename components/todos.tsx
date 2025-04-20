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
    <div className="p-4 flex flex-col gap-2 h-full">
      <AddTodo window={window} />
      <ul className="overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-[#a0c878] [&::-webkit-scrollbar-thumb]:bg-[#255f38] [&::-webkit-scrollbar-thumb]:rounded-lg [scrollbar-width:thin] [scrollbar-color:#255f38_#a0c878]">
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
