"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useWindowStore } from "@/stores/window-state";
import OptionModal from "./modals/option-modal";
import AddWindow from "./window";
import { useWindows } from "@/apis/services/window-services/query";
import type { Window as WindowType } from "@/types/windows";
import { WindowErrorBoundary } from "./window-error-boundary";

const LOADING_SKELETON_COUNT = 2;

const WindowZone = () => {
  const { data: serverWindows = [], isPending, isSuccess } = useWindows();

  const localWindows = useWindowStore((state) => state.windows);
  const setWindows = useWindowStore((state) => state.setWindows);
  const mergeWindows = useWindowStore((state) => state.mergeWindows);

  const [selectedId, setSelectedId] = useState<number | null>(null);

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

  const selectedWindow = localWindows.find((w) => w.id === selectedId);

  return (
    <>
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {isPending &&
          Array.from({ length: LOADING_SKELETON_COUNT }).map((_, i) => (
            <div
              key={i}
              className="absolute border-2 border-dark rounded-2xl bg-primary animate-pulse opacity-40"
              style={{ width: 300, height: 160, left: 120 + i * 80, top: 120 + i * 50 }}
            />
          ))}
        {localWindows.map((win: WindowType) => (
          <WindowErrorBoundary key={win.id}>
            <AddWindow window={win} onOpenOption={() => setSelectedId(win.id)} />
          </WindowErrorBoundary>
        ))}
      </div>
      {selectedId !== null && selectedWindow &&
        createPortal(
          <OptionModal window={selectedWindow} onClose={() => setSelectedId(null)} />,
          document.body
        )
      }
    </>
  );
};

export default WindowZone;
