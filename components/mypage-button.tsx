import React from "react";

export const MypageButton = ({
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  return (
    <button
      {...props}
      className={`flex justify-center items-center gap-2 w-full px-3 py-2 rounded-md cursor-pointer border-2  border-dark max-w-[250px] ${props.className}`}
    >
      {props.children}
    </button>
  );
};
