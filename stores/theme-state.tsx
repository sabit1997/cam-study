import { create } from "zustand";

interface ThemeState {
  primaryHex: string;
  darkHex: string;
  textHex: string;
  selectedTextHex: string;
  setPrimaryHex: (hex: string) => void;
  setDarkHex: (hex: string) => void;
  setTextHex: (hex: string) => void;
  setSelectedTextHex: (hex: string) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  primaryHex: getInitial("primary-color", "#a0c878"),
  darkHex: getInitial("dark-color", "#255f38"),
  textHex: getInitial("text-primary", "#000000"),
  selectedTextHex: getInitial("text-selected", "#ffffff"),

  setPrimaryHex: (hex) => {
    localStorage.setItem("primary-color", hex);
    set({ primaryHex: hex });
  },
  setDarkHex: (hex) => {
    localStorage.setItem("dark-color", hex);
    set({ darkHex: hex });
  },
  setTextHex: (hex) => {
    localStorage.setItem("text-primary", hex);
    set({ textHex: hex });
  },
  setSelectedTextHex: (hex) => {
    localStorage.setItem("text-selected", hex);
    set({ selectedTextHex: hex });
  },
}));

function getInitial(key: string, fallback: string): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem(key) || fallback;
  }
  return fallback;
}
