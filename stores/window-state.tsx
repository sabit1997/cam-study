import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WidowData {
  id: number;
  type: "none" | "camera" | "youtube" | "window";
  url?: string;
  zIndex: number;
}

interface WindowState {
  windows: WidowData[];
  addWindows: () => void;
  updateWindowType: (id: number, type: WidowData["type"]) => void;
  removeWindows: (id: number) => void;
  updateYoutubeUrl: (id: number, url: string) => void;
  bringToFront: (id: number) => void;
}

export const useWindowStore = create<WindowState>()(
  persist(
    (set) => ({
      windows: [],
      addWindows: () =>
        set((state) => {
          const maxZ = Math.max(0, ...state.windows.map((w) => w.zIndex || 0));
          return {
            windows: [
              ...state.windows,
              {
                id: Date.now(),
                type: "none",
                url: undefined,
                zIndex: maxZ + 1,
              },
            ],
          };
        }),
      updateWindowType: (id, type) =>
        set((state) => ({
          windows: state.windows.map((w) => (w.id === id ? { ...w, type } : w)),
        })),
      removeWindows: (id: number) =>
        set((state) => ({
          windows: state.windows.filter((w) => w.id !== id),
        })),
      updateYoutubeUrl: (id: number, url: string) =>
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
    }),

    {
      name: "window-storage",
    }
  )
);
