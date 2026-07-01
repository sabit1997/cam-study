"use client";

import { useCreateWindow } from "@/apis/services/window-services/mutation";
import { useWindowStore } from "@/stores/window-state";
import { FaCirclePlus } from "react-icons/fa6";
import { toast } from "sonner";

const CASCADE_MAX = 12;
const STEP_X = 58;
const STEP_Y = 32;
const INIT_X = 500;
const INIT_Y = 400;
const INIT_W = 538;
const INIT_H = 238;

const AddButton = () => {
  const { mutate: createWindow, isPending } = useCreateWindow();
  const windows = useWindowStore((state) => state.windows);

  const handleClick = () => {
    const maxZIndex =
      windows.length > 0 ? Math.max(...windows.map((w) => w.zIndex)) : 0;
    const step = windows.length % CASCADE_MAX;

    createWindow(
      {
        type: "none",
        zIndex: maxZIndex + 1,
        x: INIT_X + step * STEP_X,
        y: INIT_Y + step * STEP_Y,
        width: INIT_W,
        height: INIT_H,
      },
      {
        onError: () => {
          toast.error("창 추가에 실패했습니다.");
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
