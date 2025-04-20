"use client";

import { useAddTodo } from "@/apis/services/todo-services/mutation";
import RectangleButton from "./rectangle-button";
import { useState } from "react";
import { Window } from "@/types/windows";

interface AddTodoProps {
  window: Window;
}

const AddTodo = ({ window }: AddTodoProps) => {
  const { mutate: addTodo } = useAddTodo();
  const [todo, setTodo] = useState("");
  return (
    <div className="flex justify-center items-center gap-3">
      <input
        type="text"
        placeholder="Enter your todo..."
        className="rounded-md border-2 border-[#255f38] p-[10px]"
        value={todo}
        onChange={(e) => setTodo(e.target.value)}
      />
      <RectangleButton onClick={() => addTodo({ id: window.id, text: todo })}>
        ADD
      </RectangleButton>
    </div>
  );
};

export default AddTodo;
