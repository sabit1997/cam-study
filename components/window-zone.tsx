"use client";

import { useEffect } from "react";
import { useWindowStore } from "@/stores/window-state";
import AddWindow from "./window";
import { useWindows } from "@/apis/services/window-services/query";
import type { Window as WindowType } from "@/types/windows";
import { WindowErrorBoundary } from "./window-error-boundary";

const WindowZone = () => {
  const { data: serverWindows = [], isPending, isSuccess } = useWindows();

  const localWindows = useWindowStore((state) => state.windows);
  const setWindows = useWindowStore((state) => state.setWindows);
  const mergeWindows = useWindowStore((state) => state.mergeWindows);

  useEffect(() => {
    if (!isPending && isSuccess) {
      if (localWindows.length === 0) {
        setWindows(serverWindows);
      } else {
        mergeWindows(serverWindows);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverWindows, isPending, isSuccess]);

  return (
    <>
      {/* Safe area: below nav (36px), above dock (80px). overflow-visible so window shadows show. */}
      <div className="fixed pointer-events-none" style={{ top: 36, left: 0, right: 0, bottom: 80 }}>
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin" />
          </div>
        )}
        {localWindows.map((win: WindowType) => (
          <WindowErrorBoundary key={win.id}>
            <AddWindow window={win} />
          </WindowErrorBoundary>
        ))}
      </div>
    </>
  );
};

export default WindowZone;
