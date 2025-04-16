"use client";

import { useWindowStore } from "@/stores/window-state";
import AddWindow from "./window";
import { useState } from "react";
import OptionModal from "./modals/option-modal";

const WindowZone = () => {
  const windows = useWindowStore((state) => state.windows);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {windows.map((w) => (
        <div key={w.id}>
          <AddWindow id={w.id} onOpenOption={() => setSelectedId(w.id)} />
          {selectedId === w.id && (
            <OptionModal id={w.id} onClose={() => setSelectedId(null)} />
          )}
        </div>
      ))}
    </div>
  );
};

export default WindowZone;
