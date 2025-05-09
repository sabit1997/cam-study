import React, { InputHTMLAttributes } from "react";

interface InputWithLabelProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const InputWithLabel = ({ label, id, ...props }: InputWithLabelProps) => {
  return (
    <div className="flex gap-3 w-full items-center">
      <label htmlFor={id} className="block w-[96px]">
        {label}
      </label>
      <input
        id={id}
        {...props}
        className={`p-2 border-2 border-[#B4B4B8] focus:outline-0 focus:border-dark rounded-md autofill:bg-transparent autofill:text-transparent ${
          props.className ?? ""
        }`}
      />
    </div>
  );
};

export default InputWithLabel;
