"use client";

import { useEffect, useState } from "react";
import { useWindowStore } from "@/stores/window-state";
import OptionModal from "./modals/option-modal";
import AddWindow from "./window";
import { useWindows } from "@/apis/services/window-services/query";

const WindowZone = () => {
  const isLoggedIn =
    typeof document !== "undefined"
      ? document.cookie.includes("AccessToken=")
      : false;

  const { data: serverWindows = [] } = useWindows(isLoggedIn);

  const localWindows = useWindowStore((state) => state.windows);
  const setWindows = useWindowStore((state) => state.setWindows);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const serverIds = serverWindows.map((w) => w.id);
    const localIds = localWindows.map((w) => w.id);

    const hasChanged =
      serverIds.length !== localIds.length ||
      serverIds.some((id, idx) => id !== localIds[idx]);

    if (hasChanged) {
      setWindows(serverWindows);
    }
  }, [serverWindows, localWindows, setWindows]);

  return (
    <div className="w-full h-full overflow-hidden">
      {localWindows.map((window) => (
        <div key={window.id}>
          <AddWindow
            window={window}
            onOpenOption={() => setSelectedId(window.id)}
          />
          {selectedId === window.id && (
            <OptionModal window={window} onClose={() => setSelectedId(null)} />
          )}
        </div>
      ))}
    </div>
  );
};

export default WindowZone;
