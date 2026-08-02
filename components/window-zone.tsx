
import { useEffect } from "react";
import { useWindowStore } from "@/stores/window-state";
import AddWindow from "./window";
import { useWindows } from "@/apis/services/window-services/query";
import type { Window as WindowType } from "@/types/windows";
import { WindowErrorBoundary } from "./window-error-boundary";
import useViewportSize from "@/hooks/useViewportSize";
import {
  getWorkspaceScale,
  WORKSPACE_HEIGHT,
  WORKSPACE_WIDTH,
} from "@/utils/workspace";

const WindowZone = () => {
  const { data: serverWindows = [], isPending, isSuccess } = useWindows();

  const localWindows = useWindowStore((state) => state.windows);
  const setWindows = useWindowStore((state) => state.setWindows);
  const mergeWindows = useWindowStore((state) => state.mergeWindows);
  const { vw, vh } = useViewportSize();
  const scale = getWorkspaceScale(vw, vh);

  useEffect(() => {
    if (!isPending && isSuccess) {
      if (localWindows.length === 0) {
        setWindows(serverWindows);
      } else {
        mergeWindows(serverWindows);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand setter 참조는 안정적이므로 의존성 배열 제외 안전
  }, [serverWindows, isPending, isSuccess]);

  return (
    <>
      {/* A fixed reference workspace scales as a whole, like a map. */}
      <div className="fixed pointer-events-none" style={{ top: 36, left: 0, right: 0, bottom: 0 }}>
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin" />
          </div>
        )}
        <div
          style={{
            width: WORKSPACE_WIDTH,
            height: WORKSPACE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {localWindows.map((win: WindowType) => (
            <WindowErrorBoundary key={win.id}>
              <AddWindow window={win} scale={scale} />
            </WindowErrorBoundary>
          ))}
        </div>
      </div>
    </>
  );
};

export default WindowZone;
