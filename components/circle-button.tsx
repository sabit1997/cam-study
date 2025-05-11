"use client";

import { IconType } from "react-icons";

interface WindowControlButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconType;
}

const WindowControlButton = ({ icon, ...props }: WindowControlButtonProps) => {
  const Icon = icon;
  return (
    <button
      {...props}
      type="button"
      className={`relative group w-3 h-3 rounded-full cursor-pointer flex items-center justify-center ${props.className}`}
    >
      {Icon && (
        <Icon className="text-black w-[10px] h-[10px] hidden group-hover:block" />
      )}
    </button>
  );
};

export default WindowControlButton;
