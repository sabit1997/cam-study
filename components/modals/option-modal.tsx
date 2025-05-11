"use client";

import { IoMdClose } from "react-icons/io";
import { useState, useEffect } from "react";
import useClickOutside from "@/hooks/useClickOutside";
import useEscapeKey from "@/hooks/useEscapeKey";
import WindowControlButton from "../circle-button";
import RectangleButton from "../rectangle-button";
import { Window } from "@/types/windows";
import { usePatchWindow } from "@/apis/services/window-services/mutation";
import { useWindowStore } from "@/stores/window-state";
import { TypeList } from "@/types/dto";

interface OptionModalProps {
  window: Window;
  onClose: () => void;
}

const OptionModal = ({ window, onClose }: OptionModalProps) => {
  const typeList: TypeList[] = ["youtube", "camera", "window", "todo", "timer"];
  const [selectedType, setSelectedType] = useState<TypeList>("none");

  const { mutate: updateWindow } = usePatchWindow();
  const windows = useWindowStore((state) => state.windows);
  const maxZIndex =
    windows.length > 0 ? Math.max(...windows.map((w) => w.zindex)) : 0;

  useEffect(() => {
    if (window) setSelectedType(window.type);
  }, [window]);

  const modalRef = useClickOutside<HTMLDivElement>(onClose);
  useEscapeKey(onClose);

  const handleConfirm = () => {
    updateWindow({ id: window.id, data: { type: selectedType } });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex justify-center items-center z-20"
      style={{ zIndex: maxZIndex + 10 }}
    >
      <div
        ref={modalRef}
        className="min-w-80 border-2 border-dark rounded-2xl min-h-50 overflow-hidden bg-primary pb-4"
      >
        <div className="flex w-full bg-dark px-3 py-2 items-center gap-3">
          <WindowControlButton
            icon={IoMdClose}
            className="bg-[#FF6363]"
            onClick={onClose}
          />

          <h2 className="text-[var(--text-selected)]">OPTION</h2>
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
      ? "bg-dark text-[var(--text-selected)]"
      : "text-[var(--text-primary)] border-[#ccc]"
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
