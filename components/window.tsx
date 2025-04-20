"use client";

import CameraView from "./camera-view";
import YouTubePlayer from "./youtube-player";
import WindowShare from "./window-share";
import WindowControlButton from "./circle-button";
import { Rnd } from "react-rnd";
import { Window } from "@/types/windows";
import {
  useDeleteWindow,
  usePatchWindow,
} from "@/apis/services/window-services/mutation";
import { useDebouncedCallback } from "use-debounce";
import { useWindowStore } from "@/stores/window-state";
import Todos from "./todos";

interface AddWindowProps {
  window: Window;
  onOpenOption: () => void;
}

const AddWindow = ({ window, onOpenOption }: AddWindowProps) => {
  const { mutate: updateWindow } = usePatchWindow();
  const { mutate: deleteWindow } = useDeleteWindow();

  const { bringToFront, updateWindowBounds, windows } = useWindowStore();

  const { id, type, zindex, x, y, width, height } = window;
  const currentWindow = windows.find((w) => w.id === window.id);

  const handleClose = () => {
    deleteWindow(id);
  };

  const handleClickOrFocus = () => {
    bringToFront(id);
    debouncedZIndexUpdate();
  };

  const debouncedZIndexUpdate = useDebouncedCallback(() => {
    const maxZ = currentWindow?.zindex || 0;
    updateWindow({ id, data: { zindex: maxZ + 1 } });
  }, 300);

  const debouncedServerUpdate = useDebouncedCallback(
    (x: number, y: number, width: number, height: number) => {
      updateWindow({ id, data: { x, y, width, height } });
    },
    500
  );

  const handleMoveOrResize = (
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    updateWindowBounds(id, x, y, width, height);
    debouncedServerUpdate(x, y, width, height);
  };

  return (
    <Rnd
      position={{ x, y }}
      size={{ width, height }}
      minWidth={240}
      minHeight={135}
      maxHeight={390}
      maxWidth={645}
      bounds="window"
      style={{
        zIndex: zindex,
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
      onDragStart={handleClickOrFocus}
      onResizeStart={handleClickOrFocus}
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
      <div
        className={`w-full h-full border-2 border-[#255f38] rounded-2xl bg-[#a0c878] relative pt-[26px] overflow-hidden`}
      >
        <div className="drag-handle flex gap-2 w-full bg-[#255f38] px-3 py-2 cursor-move fixed rounded-t-2xl left-0 z-10 top-0">
          <WindowControlButton type="close" onClick={handleClose} />
          <WindowControlButton type="option" onClick={onOpenOption} />
        </div>
        <div
          className={"w-full h-full overflow-hidden"}
          onClick={handleClickOrFocus}
        >
          {type === "camera" && <CameraView />}
          {type === "youtube" && <YouTubePlayer window={window} />}
          {type === "window" && <WindowShare />}
          {type === "todo" && <Todos window={window} />}
        </div>
      </div>
    </Rnd>
  );
};

export default AddWindow;
