"use client";

import { useThemeStore } from "@/stores/theme-state";
import { applyThemeColors } from "@/utils/set-theme-color";
import { useEffect } from "react";

const GlobalInitializer = () => {
  const { primaryHex, darkHex, textHex, selectedTextHex } = useThemeStore();

  useEffect(() => {
    applyThemeColors({
      primary: primaryHex,
      dark: darkHex,
      text: textHex,
      selectedText: selectedTextHex,
    });
  }, [primaryHex, darkHex, textHex, selectedTextHex]);

  console.log(primaryHex);

  return null;
};

export default GlobalInitializer;
