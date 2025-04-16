"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WidowData {
  id: number;
  type: "none" | "camera" | "youtube" | "window";
  url?: string;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowState {
  windows: WidowData[];
  addWindows: () => void;
  updateWindowType: (id: number, type: WidowData["type"]) => void;
  removeWindows: (id: number) => void;
  updateYoutubeUrl: (id: number, url: string) => void;
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

      addWindows: () =>
        set((state) => {
          const maxZ = Math.max(0, ...state.windows.map((w) => w.zIndex || 0));
          const offset = state.windows.length * 20;

          const newId = Date.now();
          return {
            windows: [
              ...state.windows,
              {
                id: newId,
                type: "none",
                url: undefined,
                zIndex: maxZ + 1,
                x: 100 + offset,
                y: 100 + offset,
                width: 320,
                height: 180,
              },
            ],
          };
        }),

      updateWindowType: (id, type) =>
        set((state) => ({
          windows: state.windows.map((w) => (w.id === id ? { ...w, type } : w)),
        })),

      removeWindows: (id) =>
        set((state) => ({
          windows: state.windows.filter((w) => w.id !== id),
        })),

      updateYoutubeUrl: (id, url) =>
        set((state) => ({
          windows: state.windows.map((w) => (w.id === id ? { ...w, url } : w)),
        })),

      bringToFront: (id) =>
        set((state) => {
          const maxZ = Math.max(...state.windows.map((w) => w.zIndex || 0));
          return {
            windows: state.windows.map((w) =>
              w.id === id ? { ...w, zIndex: maxZ + 1 } : w
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
