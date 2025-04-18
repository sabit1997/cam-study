"use client";

import { useState, useEffect } from "react";
import useClickOutside from "@/hooks/useClickOutside";
import useEscapeKey from "@/hooks/useEscapeKey";
import WindowControlButton from "../circle-button";
import RectangleButton from "../rectangle-button";
import { Window } from "@/types/windows";
import { useUpdateWindow } from "@/hooks/useWindows";

type TypeList = "none" | "youtube" | "camera" | "window";

interface OptionModalProps {
  window: Window;
  onClose: () => void;
}

const OptionModal = ({ window, onClose }: OptionModalProps) => {
  const typeList: TypeList[] = ["youtube", "camera", "window"];
  const [selectedType, setSelectedType] = useState<TypeList>("none");

  const { mutate: updateWindow } = useUpdateWindow();

  useEffect(() => {
    if (window) setSelectedType(window.type);
  }, [window]);

  const modalRef = useClickOutside<HTMLDivElement>(onClose);
  useEscapeKey(onClose);

  const handleConfirm = () => {
    updateWindow({ id: window.id, updates: { type: selectedType } });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-20">
      <div
        ref={modalRef}
        className="w-[300px] min-w-80 border-2 border-[#255f38] rounded-2xl min-h-50 overflow-hidden bg-[#a0c878]"
      >
        <div className="flex w-full bg-[#255f38] px-3 py-2 items-center gap-3">
          <WindowControlButton type="close" onClick={onClose} />

          <h2 className="text-white">OPTION</h2>
        </div>
        <ul className="p-2">
          {typeList.map((type) => (
            <li
              key={type}
              onClick={() => setSelectedType(type)}
              className={`
  flex items-center px-3 py-2 mb-[6px] border rounded-md cursor-pointer
  ${
    selectedType === type
      ? "bg-[#255f38] text-white"
      : "text-black border-[#ccc]"
  }
`}
            >
              <span className="mr-2">
                {selectedType === type ? "✅" : "⬜️"}
              </span>
              {type.toUpperCase()}
            </li>
          ))}
        </ul>

        <RectangleButton width="w-[60%]" onClick={handleConfirm}>
          APPLY
        </RectangleButton>
      </div>
    </div>
  );
};

export default OptionModal;
