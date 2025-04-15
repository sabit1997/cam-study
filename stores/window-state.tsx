import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WidowData {
  id: number;
  type: "none" | "camera" | "youtube" | "window";
  url?: string;
}

interface WindowState {
  windows: WidowData[];
  addWindows: () => void;
  updateWindowType: (id: number, type: WidowData["type"]) => void;
  removeWindows: (id: number) => void;
  updateYoutubeUrl: (id: number, url: string) => void;
}

export const useWindowStore = create<WindowState>()(
  persist(
    (set) => ({
      windows: [],
      addWindows: () =>
        set((state) => ({
          windows: [
            ...state.windows,
            { id: Date.now(), type: "none", url: undefined },
          ],
        })),
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
    }),
    {
      name: "window-storage",
    }
  )
);
