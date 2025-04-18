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
  const setWindows = useWindowStore((state) => state.setWindows);
  const localWindows = useWindowStore((state) => state.windows);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (serverWindows.length > 0) {
      setWindows(serverWindows);
    }
  }, [serverWindows]);

  return (
    <div className="relative w-full h-full overflow-hidden">
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
