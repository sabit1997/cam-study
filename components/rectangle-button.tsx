import React from "react";

interface RectangleButtonProps {
  width?: string;
  onClick?: () => void;
  children: React.ReactNode;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

const RectangleButton = ({
  width = "w-full",
  onClick,
  children,
  type = "button",
  disabled,
}: RectangleButtonProps) => {
  return (
    <button
      onClick={onClick}
      type={type}
      className={`${width} p-[10px] bg-[#255f38] text-white border-none rounded-md cursor-pointer mx-auto block`}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default RectangleButton;
