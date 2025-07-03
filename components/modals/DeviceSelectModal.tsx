"use client";

import { IoMdClose } from "react-icons/io";
import useClickOutside from "@/hooks/useClickOutside";
import useEscapeKey from "@/hooks/useEscapeKey";
import WindowControlButton from "../circle-button";
import RectangleButton from "../rectangle-button";
import { Dispatch, SetStateAction, useEffect, useState } from "react";

interface DeviceSelectModalProps {
  onClose: () => void;
  setSelectedDevice: Dispatch<SetStateAction<null | string>>;
}

const DeviceSelectModal = ({ onClose }: DeviceSelectModalProps) => {
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  const [currentId, setCurrentId] = useState<null | string>(null);

  const modalRef = useClickOutside<HTMLDivElement>(onClose);
  useEscapeKey(onClose);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    } else {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const mappingDevices = devices
          .filter((device) => device.kind === "videoinput")
          .map((device) => ({
            id: device.deviceId,
            label: device.label,
          }));
        setDevices(mappingDevices);
      });
    }
  }, []);

  const handleConfirm = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-9999999">
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
          {devices.map((device) => (
            <li
              key={device.id}
              onClick={() => setCurrentId(device.id)}
              className={`
  flex items-center px-3 py-2 mb-[6px] border rounded-md cursor-pointer
  ${
    currentId === device.id
      ? "bg-dark text-[var(--text-selected)]"
      : "text-[var(--text-primary)] border-[#ccc]"
  }
`}
            >
              <span className="mr-2">
                {currentId === device.id ? "✅" : "⬜️"}
              </span>
              {device.label}
            </li>
          ))}
        </ul>

        <RectangleButton width="w-[60%]" onClick={handleConfirm}>
          Apply
        </RectangleButton>
      </div>
    </div>
  );
};

export default DeviceSelectModal;
