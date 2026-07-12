"use client";

import { useGetTodos } from "@/apis/services/todo-services/query";
import { Window } from "@/types/windows";
import {
  useDeleteTodo,
  useDoneTodo,
  useAddTodo,
} from "@/apis/services/todo-services/mutation";
import { FiCheck, FiTrash2, FiCheckSquare, FiPlus } from "react-icons/fi";
import { useState } from "react";

type Filter = "all" | "active" | "done";

const Todos = ({ window }: { window: Window }) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [input, setInput] = useState("");

  const { data: allTodos = [] } = useGetTodos(window.id, { date });
  const { mutate: addTodo, isPending: isAddPending } = useAddTodo();
  const { mutate: deleteTodo, isPending: isDeletePending } = useDeleteTodo();
  const { mutate: doneTodo, isPending: isDonePending } = useDoneTodo();

  const filtered =
    filter === "all"
      ? allTodos
      : filter === "active"
      ? allTodos.filter((t) => !t.done)
      : allTodos.filter((t) => t.done);

  const doneCount = allTodos.filter((t) => t.done).length;
  const progress = allTodos.length ? doneCount / allTodos.length : 0;

  const handleAdd = () => {
    if (!input.trim() || isAddPending) return;
    addTodo({ id: window.id, text: input.trim() });
    setInput("");
  };

  const handleToggle = (todoId: number, done: boolean) => {
    if (isDonePending) return;
    doneTodo({ winId: window.id, todoId, done });
  };

  const handleDelete = (todoId: number) => {
    if (isDeletePending) return;
    deleteTodo({ winId: window.id, todoId });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Date + progress */}
      <div className="px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs text-gray-500 dark:text-gray-400 bg-transparent border-none outline-none cursor-pointer"
          />
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {doneCount} / {allTodos.length} 완료
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress * 100}%`,
              background: progress >= 1 ? "#b8d890" : "#8fb870",
            }}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-700/50 flex-shrink-0">
        {(["all", "active", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 text-xs py-1.5 font-medium transition-colors ${
              filter === f
                ? "text-lime-700 border-b-2 border-lime-500"
                : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
            }`}
          >
            {f === "all" ? "전체" : f === "active" ? "진행중" : "완료"}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-20 text-gray-300 dark:text-gray-600">
            <FiCheckSquare size={22} className="mb-1" />
            <p className="text-xs">할 일 없음</p>
          </div>
        )}
        {filtered.map((todo) => (
          <div
            key={todo.id}
            className="flex items-center gap-2.5 py-2 group border-b border-gray-50 dark:border-gray-700/30 last:border-0"
          >
            <button
              onClick={() => handleToggle(todo.id, !!todo.done)}
              className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                todo.done
                  ? "border-lime-500 bg-lime-500"
                  : "border-gray-300 hover:border-lime-400"
              }`}
            >
              {todo.done && (
                <FiCheck size={9} className="text-white" strokeWidth={3} />
              )}
            </button>
            <span
              className={`flex-1 text-sm leading-tight truncate ${
                todo.done ? "line-through text-gray-300 dark:text-gray-600" : "text-gray-700 dark:text-gray-200"
              }`}
            >
              {todo.text}
            </span>
            <button
              onClick={() => handleDelete(todo.id)}
              className="opacity-0 group-hover:opacity-100 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
            >
              <FiTrash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-700/50 flex-shrink-0">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="할 일을 추가하세요…"
            className="flex-1 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 outline-none focus:border-lime-400 bg-gray-50 dark:bg-gray-800 dark:text-gray-200 transition-colors"
          />
          <button
            onClick={handleAdd}
            disabled={isAddPending || !input.trim()}
            className="px-2.5 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #e8c8f0, #c0b8e8)" }}
          >
            <FiPlus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Todos;
