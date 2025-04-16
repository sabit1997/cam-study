"use client";

import { useState, useEffect } from "react";
import { useWindowStore } from "@/stores/window-state";
import useClickOutside from "@/hooks/useClickOutside";
import useEscapeKey from "@/hooks/useEscapeKey";
import WindowControlButton from "../circle-button";

type TypeList = "none" | "youtube" | "camera" | "window";

interface OptionModalProps {
  id: number;
  onClose: () => void;
}

const OptionModal = ({ id, onClose }: OptionModalProps) => {
  const typeList: TypeList[] = ["youtube", "camera", "window"];
  const window = useWindowStore((state) =>
    state.windows.find((w) => w.id === id)
  );
  const updateType = useWindowStore((state) => state.updateWindowType);

  const [selectedType, setSelectedType] = useState<TypeList>("none");

  useEffect(() => {
    if (window) setSelectedType(window.type);
  }, [window]);

  const modalRef = useClickOutside<HTMLDivElement>(onClose);
  useEscapeKey(onClose);

  const handleConfirm = () => {
    updateType(id, selectedType);
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

        <button
          onClick={handleConfirm}
          className="my-4 w-[60%] p-[10px] bg-[#255f38] text-white border-none rounded-md cursor-pointer mx-auto block"
        >
          APPLY
        </button>
      </div>
    </div>
  );
};

export default OptionModal;
