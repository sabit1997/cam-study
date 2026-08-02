
import { Window } from "@/types/windows";
import { create } from "zustand";

let nextWindowUpdateGeneration = 0;

function getTopWindowId(windows: Window[]) {
  return windows.reduce<Window | undefined>(
    (top, window) => (!top || window.zIndex > top.zIndex ? window : top),
    undefined
  )?.id ?? null;
}

interface WindowState {
  windows: Window[];
  focusedWindowId: number | null;
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
  focusedWindowId: null,
  pendingWindowUpdates: {},
  setWindows: (windows) =>
    set(() => ({
      windows,
      focusedWindowId: getTopWindowId(windows),
      pendingWindowUpdates: {},
    })),

  mergeWindows: (serverWindows) =>
    set((state) => {
      const maxLocalZ = state.windows.reduce((m, w) => Math.max(m, w.zIndex || 0), 0);
      let nextZ = maxLocalZ;
      const windows = serverWindows.map((sw) => {
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
        });
      return {
        windows,
        focusedWindowId: windows.some((w) => w.id === state.focusedWindowId)
          ? state.focusedWindowId
          : getTopWindowId(windows),
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
        focusedWindowId:
          state.focusedWindowId === id
            ? getTopWindowId(state.windows.filter((w) => w.id !== id))
            : state.focusedWindowId,
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
      if (target.zIndex === topZ) return { focusedWindowId: id };

      return {
        focusedWindowId: id,
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
