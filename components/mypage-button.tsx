import React from "react";

export const MypageButton = ({
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  return (
    <button
      {...props}
      className={`flex justify-center items-center gap-2 w-full px-3 py-2 rounded-md cursor-pointer border-2  border-[#255f38] ${props.className}`}
    >
      {props.children}
    </button>
  );
};
