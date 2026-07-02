import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ThemeState {
  primaryHex: string;
  darkHex: string;
  textHex: string;
  selectedTextHex: string;
  setPrimaryHex: (hex: string) => void;
  setDarkHex: (hex: string) => void;
  setTextHex: (hex: string) => void;
  setSelectedTextHex: (hex: string) => void;
  resetTheme: () => void;
}

const DEFAULT_THEME = {
  primaryHex: "#a0c878",
  darkHex: "#255f38",
  textHex: "#000000",
  selectedTextHex: "#ffffff",
};

export const useThemeStore = create(
  persist(
    (set) => ({
      ...DEFAULT_THEME,

      setPrimaryHex: (hex: string) => set({ primaryHex: hex }),
      setDarkHex: (hex: string) => set({ darkHex: hex }),
      setTextHex: (hex: string) => set({ textHex: hex }),
      setSelectedTextHex: (hex: string) => set({ selectedTextHex: hex }),
      resetTheme: () => set(DEFAULT_THEME),
    }),
    {
      name: "theme-store",
      partialize: (state: ThemeState) => ({
        primaryHex: state.primaryHex,
        darkHex: state.darkHex,
        textHex: state.textHex,
        selectedTextHex: state.selectedTextHex,
      }),
    }
  )
);
