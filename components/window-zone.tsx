
import { useEffect } from "react";
import { useWindowStore } from "@/stores/window-state";
import AddWindow from "./window";
import { useWindows } from "@/apis/services/window-services/query";
import type { Window as WindowType } from "@/types/windows";
import { WindowErrorBoundary } from "./window-error-boundary";
import useViewportSize from "@/hooks/useViewportSize";

const WindowZone = () => {
  const { data: serverWindows = [], isPending, isSuccess } = useWindows();

  const localWindows = useWindowStore((state) => state.windows);
  const setWindows = useWindowStore((state) => state.setWindows);
  const mergeWindows = useWindowStore((state) => state.mergeWindows);

  // 창 개수만큼 훅 인스턴스가 생기던 것을 여기서 한 번만 구독하고 각 AddWindow 에
  // props 로 내려준다. window.resize 리스너와 handleResize 호출을 5회 → 1회로 축소.
  const { vw, vh } = useViewportSize();

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
      {/* Safe area: below nav (36px). Dock floats above windows. */}
      <div className="fixed pointer-events-none" style={{ top: 36, left: 0, right: 0, bottom: 0 }}>
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin" />
          </div>
        )}
        {localWindows.map((win: WindowType) => (
          <WindowErrorBoundary key={win.id}>
            <AddWindow window={win} vw={vw} vh={vh} />
          </WindowErrorBoundary>
        ))}
      </div>
    </>
  );
};

export default WindowZone;
