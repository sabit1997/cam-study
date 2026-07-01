"use client";

import { IoMdClose } from "react-icons/io";
import { IoIosSettings } from "react-icons/io";
import { TbBlur } from "react-icons/tb";

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
import Timer from "./timer";
import React, { useState } from "react";
import TooltipWrapper from "./tooltip-wrapper";
import useScreenSizeRef from "@/hooks/useScreenSizeRef";

interface AddWindowProps {
  window: Window;
  onOpenOption: () => void;
}

const REF_W = 1920;

const AddWindow = ({ window, onOpenOption }: AddWindowProps) => {
  const [isBlur, setIsBlur] = useState(false);

  const { mutate: updateWindow, isPending: isUpdatePending } = usePatchWindow();
  const { mutate: deleteWindow, isPending: isDeletePending } =
    useDeleteWindow();

  const { bringToFront, updateWindowBounds, windows } = useWindowStore();
  const { vw, vh } = useScreenSizeRef();

  const { id, type, zIndex, x, y, width, height } = window;
  const currentWindow = windows.find((w) => w.id === window.id);

  const scale = vw / REF_W;
  const pxX = x * scale;
  const pxY = y * scale;
  const pxW = width * scale;
  const pxH = height * scale;

  const handleClose = () => {
    if (isDeletePending) return;
    deleteWindow(id);
  };

  const handleClickOrFocus = () => {
    bringToFront(id);
    debouncedZIndexUpdate();
  };

  const debouncedZIndexUpdate = useDebouncedCallback(() => {
    if (isUpdatePending) return;
    const zIndex = currentWindow?.zIndex ?? 0;
    updateWindow({ id, data: { zIndex } });
  }, 300);

  const debouncedServerUpdate = useDebouncedCallback(
    (rx: number, ry: number, rw: number, rh: number) => {
      if (isUpdatePending) return;
      updateWindow({ id, data: { x: rx, y: ry, width: rw, height: rh } });
    },
    500
  );

  const handleMoveOrResize = (
    px: number,
    py: number,
    pw: number,
    ph: number
  ) => {
    const rx = Math.round(px / scale);
    const ry = Math.round(py / scale);
    const rw = Math.round(pw / scale);
    const rh = Math.round(ph / scale);
    updateWindowBounds(id, rx, ry, rw, rh);
    debouncedServerUpdate(rx, ry, rw, rh);
  };

  const windowContent: Partial<Record<Window["type"], React.ReactNode>> = {
    camera: <CameraView isBlur={isBlur} />,
    youtube: <YouTubePlayer window={window} />,
    window: <WindowShare isBlur={isBlur} windowId={window.id} />,
    todo: <Todos window={window} />,
    timer: <Timer />,
  };

  return (
    <Rnd
      position={{ x: pxX, y: pxY }}
      size={{ width: pxW, height: pxH }}
      minWidth={240}
      minHeight={135}
      maxWidth={vw * 0.95}
      maxHeight={vh * 0.95}
      bounds="window"
      style={{
        zIndex: zIndex,
        position: "absolute",
        pointerEvents: "auto",
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
      onDragStop={(e, d) => handleMoveOrResize(d.x, d.y, pxW, pxH)}
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
      <div className="w-full h-full border-2 border-dark rounded-2xl bg-primary relative pt-[26px] overflow-hidden">
        <div className="drag-handle flex gap-2 w-full bg-dark px-3 py-2 cursor-move absolute rounded-t-2xl left-0 z-10 top-0">
          <TooltipWrapper content="닫기">
            <WindowControlButton
              className="bg-[var(--color-btn-close)]"
              icon={IoMdClose}
              onClick={handleClose}
            />
          </TooltipWrapper>
          <TooltipWrapper content="옵션">
            <WindowControlButton
              className="bg-[var(--color-btn-option)]"
              icon={IoIosSettings}
              onClick={onOpenOption}
            />
          </TooltipWrapper>

          {(type === "camera" || type === "window") && (
            <TooltipWrapper content="흐리게">
              <WindowControlButton
                className="bg-[var(--color-btn-blur)]"
                icon={TbBlur}
                onClick={() => {
                  setIsBlur((prev) => !prev);
                }}
              />
            </TooltipWrapper>
          )}
        </div>
        <div
          className="w-full h-full overflow-hidden"
          onClick={handleClickOrFocus}
        >
          {windowContent[type] ?? null}
        </div>
      </div>
    </Rnd>
  );
};

export default React.memo(AddWindow);
