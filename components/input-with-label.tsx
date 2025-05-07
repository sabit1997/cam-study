import React from "react";

interface InputWithLabelProps {
  label: string;
  id: string;
  placeholder?: string;
  type?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const InputWithLabel = ({
  label,
  id,
  placeholder = "",
  type = "text",
  value,
  onChange,
}: InputWithLabelProps) => {
  return (
    <div className="flex gap-3 w-full items-center">
      <label htmlFor={id} className="block w-[96px]">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="p-2 border-2 border-[#B4B4B8] focus:outline-0 focus:border-2 focus:border-[#255f38] rounded-md autofill:bg-transparent autofill:text-transparent"
      />
    </div>
  );
};

export default InputWithLabel;
