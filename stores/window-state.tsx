"use client";

import { Window } from "@/types/windows";
import { create } from "zustand";

interface WindowState {
  windows: Window[];
  setWindows: (windows: Window[]) => void;
  mergeWindows: (serverWindows: Window[]) => void;
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

export const useWindowStore = create<WindowState>()((set) => ({
  windows: [],
  setWindows: (windows) => set(() => ({ windows })),

  mergeWindows: (serverWindows) =>
    set((state) => ({
      windows: serverWindows.map((sw) => {
        const lw = state.windows.find((w) => w.id === sw.id);
        if (!lw) return sw;
        return {
          ...sw,
          x: lw.x,
          y: lw.y,
          width: lw.width,
          height: lw.height,
          zIndex: lw.zIndex,
        };
      }),
    })),

  updateWindowType: (id, type) =>
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, type } : w)),
    })),

  bringToFront: (id) =>
    set((state) => {
      const maxZ = state.windows.reduce(
        (m, w) => Math.max(m, w.zIndex || 0),
        0
      );
      const target = state.windows.find((w) => w.id === id);
      if (!target || target.zIndex === maxZ) return state;
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
}));
