"use client";

import { useWindowStore } from "@/stores/window-state";
import CameraView from "./camera-view";
import YouTubePlayer from "./youtube-player";
import WindowShare from "./window-share";
import WindowControlButton from "./circle-button";
import { Rnd } from "react-rnd";

interface AddWindowProps {
  id: number;
  onOpenOption: () => void;
}

const AddWindow = ({ id, onOpenOption }: AddWindowProps) => {
  const removeWindow = useWindowStore((state) => state.removeWindows);
  const bringToFront = useWindowStore((state) => state.bringToFront);
  const updateWindowBounds = useWindowStore(
    (state) => state.updateWindowBounds
  );

  const window = useWindowStore((state) =>
    state.windows.find((w) => w.id === id)
  );

  if (!window) return null;

  const { type, zIndex, x, y, width, height } = window;

  const handleClose = () => {
    removeWindow(id);
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
        zIndex,
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
      onDragStart={() => bringToFront(id)}
      onResizeStart={() => bringToFront(id)}
      onDragStop={(e, d) => updateWindowBounds(id, d.x, d.y, width, height)}
      onResizeStop={(e, direction, ref, delta, position) => {
        updateWindowBounds(
          id,
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
          {type === "youtube" && <YouTubePlayer id={id} />}
          {type === "window" && <WindowShare />}
        </div>
      </div>
    </Rnd>
  );
};

export default AddWindow;
