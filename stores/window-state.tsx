"use client";

import { Window } from "@/types/windows";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WindowState {
  windows: Window[];
  setWindows: (windows: Window[]) => void;
  updateWindowType: (id: number, type: Window["type"]) => void;
  bringToFront: (id: number) => void;
  updateWindowBounds: (
    id: number,
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
}

export const useWindowStore = create<WindowState>()(
  persist(
    (set) => ({
      windows: [],
      setWindows: (windows) => set(() => ({ windows })),
      updateWindowType: (id, type) =>
        set((state) => ({
          windows: state.windows.map((w) => (w.id === id ? { ...w, type } : w)),
        })),

      bringToFront: (id) =>
        set((state) => {
          const maxZ = Math.max(...state.windows.map((w) => w.zindex || 0));
          return {
            windows: state.windows.map((w) =>
              w.id === id ? { ...w, zindex: maxZ + 1 } : w
            ),
          };
        }),

      updateWindowBounds: (id, x, y, width, height) =>
        set((state) => ({
          windows: state.windows.map((w) =>
            w.id === id ? { ...w, x, y, width, height } : w
          ),
        })),
    }),
    {
      name: "window-storage",
    }
  )
);
