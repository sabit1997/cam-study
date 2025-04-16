"use client";

import { useState } from "react";
import { useWindows } from "@/hooks/useWindows";
import OptionModal from "./modals/option-modal";
import { WindowData } from "@/types/windows";
import AddWindow from "./window";

const WindowZone = () => {
  const { data: windows = [] } = useWindows();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {windows.map((window: WindowData) => (
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
