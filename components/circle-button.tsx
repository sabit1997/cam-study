"use client";

import { IoMdClose } from "react-icons/io";
import { IoIosSettings } from "react-icons/io";

interface WindowControlButtonProps {
  type: "close" | "option";
  onClick: () => void;
}

const WindowControlButton = ({ type, onClick }: WindowControlButtonProps) => {
  const isClose = type === "close";
  const bgColor = isClose ? "bg-[#FF6363]" : "bg-[#FFD63A]";
  const Icon = isClose ? IoMdClose : IoIosSettings;

  return (
    <button
      onClick={onClick}
      className={`relative group ${bgColor} w-3 h-3 rounded-full cursor-pointer flex items-center justify-center`}
    >
      <Icon className="text-black w-[10px] h-[10px] hidden group-hover:block" />
    </button>
  );
};

export default WindowControlButton;
