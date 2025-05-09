"use client";

import { useAddTodo } from "@/apis/services/todo-services/mutation";
import RectangleButton from "./rectangle-button";
import { useState } from "react";
import { Window } from "@/types/windows";
import { AddTodoVars } from "@/types/todos";

interface AddTodoProps {
  window: Window;
}

const AddTodo = ({ window }: AddTodoProps) => {
  const { mutate: addTodo } = useAddTodo();
  const [todo, setTodo] = useState("");

  const handleAdd = ({ id, text }: AddTodoVars) => {
    addTodo({ id, text });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!!todo) {
      handleAdd({ id: window.id, text: todo });
      setTodo("");
    }
  };

  return (
    <form
      className="flex justify-center items-center gap-3 h-fit"
      onSubmit={handleSubmit}
    >
      <input
        type="text"
        placeholder="Enter your todo..."
        className="rounded-md border-2 border-dark p-[10px] w-full"
        value={todo}
        onChange={(e) => setTodo(e.target.value)}
      />
      <RectangleButton width="w-[30%] min-w-[60px]">ADD</RectangleButton>
    </form>
  );
};

export default AddTodo;
