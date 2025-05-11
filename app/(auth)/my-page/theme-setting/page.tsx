"use client";

import { useThemeStore } from "@/stores/theme-state";
import { applyThemeColors } from "@/utils/set-theme-color";
import { ColorResult, Sketch } from "@uiw/react-color";
import { useEffect } from "react";

const ThemeSetting = () => {
  const {
    primaryHex,
    darkHex,
    textHex,
    selectedTextHex,
    setPrimaryHex,
    setDarkHex,
    setTextHex,
    setSelectedTextHex,
    resetTheme,
  } = useThemeStore();

  useEffect(() => {
    applyThemeColors({
      primary: primaryHex,
      dark: darkHex,
      text: textHex,
      selectedText: selectedTextHex,
    });
  }, [primaryHex, darkHex, textHex, selectedTextHex]);

  const makeHandler = (setFn: (hex: string) => void) => (color: ColorResult) =>
    setFn(color.hex);

  const handleReset = () => {
    const confirmReset = confirm(
      "기본 설정 값으로 되돌아갑니다. 초기화 하시겠습니까?"
    );
    if (!confirmReset) return;
    resetTheme();
  };

  return (
    <div className="flex gap-12 flex-wrap justify-center relative">
      <button
        type="button"
        className="w-10 h-10 rounded-full bg-dark text-xs absolute right-5 
      -top-5"
        onClick={handleReset}
      >
        초기화
      </button>
      <div className="w-[218px] flex flex-col justify-between">
        <div>
          <p className="text-text font-bold mb-1">기본 배경 색상</p>
          <span className="text-xs opacity-50 break-keep">
            배경에 적용되는 색상입니다.
          </span>
        </div>
        <Sketch color={primaryHex} onChange={makeHandler(setPrimaryHex)} />
      </div>
      <div className="w-[218px]">
        <p className="text-text font-bold mb-1">강조 색상</p>
        <span className="text-xs opacity-50 break-keep">
          배경의 선, 버튼의 테두리 등 강조할 때 사용됩니다.
        </span>

        <Sketch color={darkHex} onChange={makeHandler(setDarkHex)} />
      </div>
      <div className="w-[218px]">
        <p className="text-text font-bold mb-1">텍스트 기본 색상</p>
        <span className="text-xs opacity-50 break-keep">
          기본적으로 사용되는 텍스트 색상입니다.
        </span>
        <Sketch color={textHex} onChange={makeHandler(setTextHex)} />
      </div>
      <div className="w-[218px]">
        <p className="text-text font-bold mb-1">텍스트 선택 시 색상</p>
        <span className="text-xs opacity-50 break-keep">
          버튼 클릭 시 혹은 선택된 버튼에 적용되는 색상입니다.
        </span>
        <Sketch
          color={selectedTextHex}
          onChange={makeHandler(setSelectedTextHex)}
        />
      </div>
    </div>
  );
};

export default ThemeSetting;
