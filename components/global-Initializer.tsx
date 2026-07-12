"use client";

import { useThemeStore } from "@/stores/theme-state";
import { applyThemeColors } from "@/utils/set-theme-color";
import { useEffect } from "react";

const GlobalInitializer = () => {
  const { primaryHex, darkHex, textHex, selectedTextHex, isDarkMode } = useThemeStore();

  useEffect(() => {
    applyThemeColors({
      primary: primaryHex,
      dark: darkHex,
      text: textHex,
      selectedText: selectedTextHex,
    });
  }, [primaryHex, darkHex, textHex, selectedTextHex]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  return null;
};

export default GlobalInitializer;
