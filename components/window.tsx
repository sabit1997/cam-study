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
  const type = useWindowStore(
    (state) => state.windows.find((w) => w.id === id)?.type
  );
  const zIndex = useWindowStore(
    (state) => state.windows.find((w) => w.id === id)?.zIndex || 1
  );
  const bringToFront = useWindowStore((state) => state.bringToFront);

  const handleClose = () => {
    removeWindow(id);
  };

  return (
    <Rnd
      default={{
        x: 100,
        y: 100,
        width: 320,
        height: 180,
      }}
      minWidth={240}
      minHeight={135} // 16:9 비율 고려한 최소 높이
      bounds="window" // 화면 전체 기준으로 드래그
      lockAspectRatio
      style={{
        zIndex,
        position: "fixed", // fixed로 변경해서 window 기준으로 이동
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
