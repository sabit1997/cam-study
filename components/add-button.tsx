"use client";

import { useCreateWindow } from "@/apis/services/window-services/mutation";
import { useWindowStore } from "@/stores/window-state";
import { FaCirclePlus } from "react-icons/fa6";

const AddButton = () => {
  const { mutate: createWindow, isPending } = useCreateWindow();
  const windows = useWindowStore((state) => state.windows);

  const handleClick = () => {
    const maxZIndex =
      windows.length > 0 ? Math.max(...windows.map((w) => w.zIndex)) : 0;
    const offset = Math.floor(Math.random() * 60);

    createWindow(
      {
        type: "none",
        zIndex: maxZIndex + 1,
        x: 100 + offset,
        y: 100 + offset,
        width: 320,
        height: 180,
      },
      {
        onError: () => {
          alert("window 추가 실패!");
        },
      }
    );
  };

  return (
    <button
      onClick={handleClick}
      className="cursor-pointer group"
      type="button"
      disabled={isPending}
    >
      <FaCirclePlus className="text-5xl mb-3 text-dark group-active:bg-[#727D73]/50 group-active:border group-active:border-dark/50" />
      <p className="p-0.5 border-2 rounded-md border-dark bg-primary text-[var(--text-primary)] group-active:bg-dark group-active:text-[var(--text-selected)]">
        ADD
      </p>
    </button>
  );
};

export default AddButton;
