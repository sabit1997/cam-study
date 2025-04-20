"use client";

import { useEffect, useState } from "react";
import { useWindowStore } from "@/stores/window-state";
import OptionModal from "./modals/option-modal";
import AddWindow from "./window";
import { useWindows } from "@/apis/services/window-services/query";
import type { Window as WindowType } from "@/types/windows";

const WindowZone = () => {
  const isLoggedIn =
    typeof document !== "undefined"
      ? document.cookie.includes("AccessToken=")
      : false;

  const { data: serverWindows = [] } = useWindows(isLoggedIn);

  const localWindows = useWindowStore((state) => state.windows);
  const setWindows = useWindowStore((state) => state.setWindows);

  const serialized = JSON.stringify(serverWindows);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    setWindows(serverWindows);
  }, [serialized, setWindows]);

  return (
    <div className="w-full h-full overflow-hidden">
      {localWindows.map((win: WindowType) => (
        <div key={win.id}>
          <AddWindow window={win} onOpenOption={() => setSelectedId(win.id)} />
          {selectedId === win.id && (
            <OptionModal window={win} onClose={() => setSelectedId(null)} />
          )}
        </div>
      ))}
    </div>
  );
};

export default WindowZone;
