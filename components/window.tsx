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
import TooltipWrapper from "./TooltipWrapper";
import useScreenSizeRef from "@/hooks/useScreenSizeRef";

interface AddWindowProps {
  window: Window;
  onOpenOption: () => void;
}

const RATIO = 0.9;
const AddWindow = ({ window, onOpenOption }: AddWindowProps) => {
  const [isBlur, setIsBlur] = useState(false);

  const { mutate: updateWindow, isPending: isUpdatePending } = usePatchWindow();
  const { mutate: deleteWindow, isPending: isDeletePending } =
    useDeleteWindow();

  const { bringToFront, updateWindowBounds, windows } = useWindowStore();
  const { screenHeightRef, screenWidthRef } = useScreenSizeRef();

  const { id, type, zIndex, x, y, width, height } = window;
  const currentWindow = windows.find((w) => w.id === window.id);

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
    const maxZ = currentWindow?.zIndex || 0;
    updateWindow({ id, data: { zIndex: maxZ + 1 } });
  }, 300);

  const debouncedServerUpdate = useDebouncedCallback(
    (x: number, y: number, width: number, height: number) => {
      if (isUpdatePending) return;
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
      maxHeight={
        (screenHeightRef.current && screenHeightRef.current * RATIO) ||
        undefined
      }
      maxWidth={
        (screenWidthRef.current && screenWidthRef.current * RATIO) || undefined
      }
      bounds="window"
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
        className={`w-full h-full border-2 border-dark rounded-2xl bg-primary relative pt-[26px] overflow-hidden`}
      >
        <div className="drag-handle flex gap-2 w-full bg-dark px-3 py-2 cursor-move fixed rounded-t-2xl left-0 z-10 top-0">
          <TooltipWrapper content="닫기">
            <WindowControlButton
              className="bg-[#FF6363]"
              icon={IoMdClose}
              onClick={handleClose}
            />
          </TooltipWrapper>
          <TooltipWrapper content="옵션">
            <WindowControlButton
              className="bg-[#FFD63A]"
              icon={IoIosSettings}
              onClick={onOpenOption}
            />
          </TooltipWrapper>

          {(type === "camera" || type === "window") && (
            <TooltipWrapper content="흐리게">
              <WindowControlButton
                className="bg-[#F3D7CA]"
                icon={TbBlur}
                onClick={() => {
                  setIsBlur((prev) => !prev);
                }}
              />
            </TooltipWrapper>
          )}
        </div>
        <div
          className={"w-full h-full overflow-hidden"}
          onClick={handleClickOrFocus}
        >
          {type === "camera" && <CameraView isBlur={isBlur} />}
          {type === "youtube" && <YouTubePlayer window={window} />}
          {type === "window" && (
            <WindowShare isBlur={isBlur} windowId={window.id} />
          )}
          {type === "todo" && <Todos window={window} />}
          {type === "timer" && <Timer />}
        </div>
      </div>
    </Rnd>
  );
};

export default React.memo(AddWindow);
