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
      const sorted = [...state.windows].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
      const target = sorted.find((w) => w.id === id);
      if (!target) return state;
      const topZ = sorted[sorted.length - 1]?.zIndex ?? 0;
      if (sorted[sorted.length - 1]?.id === id) return state;

      const orderMap = new Map(sorted.map((w, i) => [w.id, i + 1]));
      orderMap.set(id, sorted.length + 1);

      // zIndex가 windows.length + 1 초과 시 1부터 재정규화
      const needsNormalize = topZ + 1 > state.windows.length * 2;
      if (needsNormalize) {
        const reordered = sorted
          .filter((w) => w.id !== id)
          .concat(target)
          .map((w, i) => ({ ...w, zIndex: i + 1 }));
        return { windows: reordered };
      }

      return {
        windows: state.windows.map((w) =>
          w.id === id ? { ...w, zIndex: topZ + 1 } : w
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
