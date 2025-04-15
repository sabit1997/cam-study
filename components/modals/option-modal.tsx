"use client";

import { useState, useEffect } from "react";
import { useWindowStore } from "@/stores/window-state";
import useClickOutside from "@/hooks/useClickOutside";
import useEscapeKey from "@/hooks/useEscapeKey";

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
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        ref={modalRef}
        style={{
          backgroundColor: "#fff",
          padding: "20px",
          borderRadius: "10px",
          width: "300px",
        }}
      >
        <span style={{ float: "right", cursor: "pointer" }} onClick={onClose}>
          ❌
        </span>
        <h2>OPTION</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {typeList.map((type) => (
            <li
              key={type}
              onClick={() => setSelectedType(type)}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
                marginBottom: "6px",
                border: "1px solid #ccc",
                borderRadius: "6px",
                cursor: "pointer",
                backgroundColor: selectedType === type ? "#0070f3" : "#fff",
                color: selectedType === type ? "#fff" : "#000",
              }}
            >
              <span style={{ marginRight: "8px" }}>
                {selectedType === type ? "✅" : "⬜️"}
              </span>
              {type.toUpperCase()}
            </li>
          ))}
        </ul>

        {/* ✅ 확인 버튼 */}
        <button
          onClick={handleConfirm}
          style={{
            marginTop: "1rem",
            width: "100%",
            padding: "10px",
            backgroundColor: "#0070f3",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          확인
        </button>
      </div>
    </div>
  );
};

export default OptionModal;
