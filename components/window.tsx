"use client";

import CameraView from "./camera-view";
import YouTubePlayer from "./youtube-player";
import WindowShare from "./window-share";
import WindowControlButton from "./circle-button";
import { Rnd } from "react-rnd";
import { Window } from "@/types/windows";
import { useUpdateWindow, useDeleteWindow } from "@/hooks/useWindows";

interface AddWindowProps {
  window: Window;
  onOpenOption: () => void;
}

const AddWindow = ({ window, onOpenOption }: AddWindowProps) => {
  const { mutate: updateWindow } = useUpdateWindow();
  const { mutate: deleteWindow } = useDeleteWindow();

  const { id, type, zIndex, x, y, width, height } = window;

  const handleClose = () => {
    deleteWindow(id);
  };

  const handleMoveOrResize = (
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    updateWindow({
      id,
      updates: { x, y, width, height, zIndex },
    });
  };

  return (
    <Rnd
      position={{ x, y }}
      size={{ width, height }}
      minWidth={240}
      minHeight={135}
      bounds="window"
      lockAspectRatio
      style={{
        zIndex: zIndex,
        position: "fixed",
      }}
      enableResizing={{
        top: true,
        right: true,
        bottom: true,
        left: true,
        topRight: true,
        bottomRight: true,
        bottomLeft: true,
        topLeft: true,
      }}
      onDragStop={(e, d) => handleMoveOrResize(d.x, d.y, width, height)}
      onResizeStop={(e, direction, ref, delta, position) => {
        handleMoveOrResize(
          position.x,
          position.y,
          ref.offsetWidth,
          ref.offsetHeight
        );
      }}
      dragHandleClassName="drag-handle"
    >
      <div className="w-full h-full border-2 border-[#255f38] rounded-2xl overflow-hidden bg-[#a0c878] relative">
        <div className="drag-handle flex gap-2 w-full bg-[#255f38] px-3 py-2 cursor-move">
          <WindowControlButton type="close" onClick={handleClose} />
          <WindowControlButton type="option" onClick={onOpenOption} />
        </div>
        <div className="w-full h-full">
          {type === "camera" && <CameraView />}
          {type === "youtube" && <YouTubePlayer window={window} />}
          {type === "window" && <WindowShare />}
        </div>
      </div>
    </Rnd>
  );
};

export default AddWindow;
