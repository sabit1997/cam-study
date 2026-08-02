
import { Window } from "@/types/windows";
import { create } from "zustand";

let nextWindowUpdateGeneration = 0;

interface WindowState {
  windows: Window[];
  pendingWindowUpdates: Record<number, number>;
  setWindows: (windows: Window[]) => void;
  mergeWindows: (serverWindows: Window[]) => void;
  markWindowPending: (id: number) => number;
  clearWindowPending: (id: number, generation?: number) => void;
  updateWindowType: (id: number, type: Window["type"]) => void;
  removeWindow: (id: number) => void;
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
  pendingWindowUpdates: {},
  setWindows: (windows) => set(() => ({ windows, pendingWindowUpdates: {} })),

  mergeWindows: (serverWindows) =>
    set((state) => {
      const maxLocalZ = state.windows.reduce((m, w) => Math.max(m, w.zIndex || 0), 0);
      let nextZ = maxLocalZ;
      return {
        windows: serverWindows.map((sw) => {
          const lw = state.windows.find((w) => w.id === sw.id);
          if (!lw) {
            // 새 창은 현재 로컬 최고 zIndex 위에 배치
            nextZ += 1;
            return { ...sw, zIndex: nextZ };
          }
          if (state.pendingWindowUpdates[sw.id] !== undefined) {
            return {
              ...sw,
              x: lw.x,
              y: lw.y,
              width: lw.width,
              height: lw.height,
              zIndex: lw.zIndex,
            };
          }
          return sw;
        }),
      };
    }),

  markWindowPending: (id) => {
    const generation = ++nextWindowUpdateGeneration;
    set((state) => ({
      pendingWindowUpdates: {
        ...state.pendingWindowUpdates,
        [id]: generation,
      },
    }));
    return generation;
  },

  clearWindowPending: (id, generation) =>
    set((state) => {
      if (
        generation !== undefined &&
        state.pendingWindowUpdates[id] !== generation
      ) {
        return state;
      }
      const pendingWindowUpdates = { ...state.pendingWindowUpdates };
      delete pendingWindowUpdates[id];
      return { pendingWindowUpdates };
    }),

  updateWindowType: (id, type) =>
    set((state) => ({
      windows: state.windows.map((w) => (w.id === id ? { ...w, type } : w)),
    })),

  // 낙관적 제거 — 서버 DELETE는 별도로 진행. 실패 시 refetch로 복원됨.
  removeWindow: (id) =>
    set((state) => {
      const pendingWindowUpdates = { ...state.pendingWindowUpdates };
      delete pendingWindowUpdates[id];
      return {
        windows: state.windows.filter((w) => w.id !== id),
        pendingWindowUpdates,
      };
    }),

  bringToFront: (id) =>
    set((state) => {
      const target = state.windows.find((w) => w.id === id);
      if (!target) return state;
      const topZ = state.windows.reduce(
        (max, window) => Math.max(max, window.zIndex || 0),
        0
      );
      if (target.zIndex === topZ) return state;

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
