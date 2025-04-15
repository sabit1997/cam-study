"use client";

import { useWindowStore } from "@/stores/window-state";
import CameraView from "./camera-view";
import YouTubePlayer from "./youtube-player";
import WindowShare from "./window-share";

interface AddWindowProps {
  id: number;
  onOpenOption: () => void;
}

const AddWindow = ({ id, onOpenOption }: AddWindowProps) => {
  const removeWindow = useWindowStore((state) => state.removeWindows);
  const type = useWindowStore(
    (state) => state.windows.find((w) => w.id === id)?.type
  );

  const handleClose = () => {
    removeWindow(id);
  };

  return (
    <div className="w-full min-w-80 border-2 border-[#255f38] rounded-2xl min-h-50 overflow-hidden bg-[#a0c878] relative">
      <ul className="flex gap-3 w-full bg-[#255f38] px-3 py-2">
        <li
          onClick={handleClose}
          className="bg-[#FF6363] w-3 h-3 rounded-full"
        ></li>
        <li
          onClick={onOpenOption}
          className="bg-[#FFD63A] w-3 h-3 rounded-full"
        ></li>
      </ul>
      <div className="w-full">
        {type === "camera" && <CameraView />}
        {type === "youtube" && <YouTubePlayer id={id} />}
        {type === "window" && <WindowShare />}
      </div>
    </div>
  );
};

export default AddWindow;
