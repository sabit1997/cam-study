"use client";

import { useCreateWindow } from "@/apis/services/window-services/mutation";
import { FaCirclePlus } from "react-icons/fa6";

const AddButton = () => {
  const { mutate: createWindow, isPending } = useCreateWindow();

  const handleClick = () => {
    const offset = Math.floor(Math.random() * 60);

    createWindow(
      {
        type: "none",
        zindex: 1,
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
      <FaCirclePlus className="text-5xl mb-3 text-[#255f38] group-active:bg-[#727D73]/50 group-active:border group-active:border-[#255f38]/50" />
      <p className="p-0.5 border-2 rounded-md border-[#255f38] bg-[#a0c878] text-black group-active:bg-[#255f38] group-active:text-white">
        ADD
      </p>
    </button>
  );
};

export default AddButton;
