"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

interface PomodoroSettingsModalProps {
  workMins: number;
  breakMins: number;
  onApply: (workMins: number, breakMins: number) => void;
  onClose: () => void;
}

export default function PomodoroSettingsModal({
  workMins,
  breakMins,
  onApply,
  onClose,
}: PomodoroSettingsModalProps) {
  const [workInput, setWorkInput] = useState(String(workMins));
  const [breakInput, setBreakInput] = useState(String(breakMins));

  const handleApply = () => {
    const w = Math.max(1, Math.min(120, parseInt(workInput) || workMins));
    const b = Math.max(1, Math.min(60, parseInt(breakInput) || breakMins));
    onApply(w, b);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999, background: "rgba(0,0,0,0.25)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-[#1a1c2a] rounded-2xl shadow-xl px-6 py-5 flex flex-col gap-4"
        style={{ width: 280, border: "1px solid rgba(255,255,255,0.9)" }}
      >
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-center">
          포모도로 시간 설정
        </h3>

        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-400 dark:text-gray-500 w-12 shrink-0">집중</label>
          <div className="flex items-center gap-2 flex-1">
            <input
              type="number"
              min={1}
              max={120}
              value={workInput}
              onChange={(e) => setWorkInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleApply()}
              className="no-spin w-full text-sm text-center rounded-lg border border-gray-200 dark:border-gray-700 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 outline-none focus:border-lime-400 transition-colors"
            />
            <span className="text-xs text-gray-400 shrink-0">분</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-400 dark:text-gray-500 w-12 shrink-0">휴식</label>
          <div className="flex items-center gap-2 flex-1">
            <input
              type="number"
              min={1}
              max={60}
              value={breakInput}
              onChange={(e) => setBreakInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleApply()}
              className="no-spin w-full text-sm text-center rounded-lg border border-gray-200 dark:border-gray-700 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 outline-none focus:border-lime-400 transition-colors"
            />
            <span className="text-xs text-gray-400 shrink-0">분</span>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-2 text-xs rounded-xl text-white font-semibold transition-colors"
            style={{ background: "#8fb870" }}
          >
            적용
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
