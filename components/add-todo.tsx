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
    if (!!todo) {
      addTodo({ id, text });
      setTodo("");
    }
  };
  return (
    <div className="flex justify-center items-center gap-3 h-fit">
      <input
        type="text"
        placeholder="Enter your todo..."
        className="rounded-md border-2 border-[#255f38] p-[10px] w-full"
        value={todo}
        onChange={(e) => setTodo(e.target.value)}
      />
      <RectangleButton
        width="w-[30%] min-w-[60px]"
        onClick={() => handleAdd({ id: window.id, text: todo })}
      >
        ADD
      </RectangleButton>
    </div>
  );
};

export default AddTodo;
