"use client";

import { useEffect, useState } from "react";
import { LuDownload, LuRefreshCw, LuX } from "react-icons/lu";

type UpdateState =
  | { phase: "idle" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; percent: number }
  | { phase: "ready" };

export default function UpdateNotifier() {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    const offAvailable = window.electronAPI.on("update:available", (version) => {
      setState({ phase: "available", version: version as string });
      setDismissed(false);
    });
    const offProgress = window.electronAPI.on("update:progress", (percent) => {
      setState({ phase: "downloading", percent: percent as number });
    });
    const offReady = window.electronAPI.on("update:downloaded", () => {
      setState({ phase: "ready" });
      setDismissed(false);
    });

    return () => { offAvailable(); offProgress(); offReady(); };
  }, []);

  if (dismissed || state.phase === "idle") return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm"
      style={{
        background: "linear-gradient(135deg, #f0f7ea, #e8f3e0)",
        border: "1px solid #c8e0b8",
        minWidth: 260,
      }}
    >
      {state.phase === "available" && (
        <>
          <LuDownload size={16} className="text-[#6a9f50] flex-shrink-0" />
          <div className="flex-1 leading-snug">
            <p className="font-semibold text-[#3d6b28] text-xs">새 버전 {state.version}</p>
            <p className="text-[11px] text-[#6a9f50]">백그라운드에서 다운로드 중...</p>
          </div>
          <button onClick={() => setDismissed(true)} className="text-[#a0c888] hover:text-[#6a9f50]">
            <LuX size={13} />
          </button>
        </>
      )}

      {state.phase === "downloading" && (
        <>
          <LuDownload size={16} className="text-[#6a9f50] flex-shrink-0 animate-bounce" />
          <div className="flex-1">
            <p className="font-semibold text-[#3d6b28] text-xs mb-1">업데이트 다운로드 중</p>
            <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${state.percent}%`, background: "#8fb870" }}
              />
            </div>
            <p className="text-[11px] text-[#6a9f50] mt-0.5">{state.percent}%</p>
          </div>
        </>
      )}

      {state.phase === "ready" && (
        <>
          <LuRefreshCw size={16} className="text-[#6a9f50] flex-shrink-0" />
          <div className="flex-1 leading-snug">
            <p className="font-semibold text-[#3d6b28] text-xs">업데이트 준비 완료!</p>
            <p className="text-[11px] text-[#6a9f50]">재시작하면 적용돼요</p>
          </div>
          <button
            onClick={() => window.electronAPI?.restartAndUpdate()}
            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full text-white transition-opacity hover:opacity-80"
            style={{ background: "#8fb870" }}
          >
            재시작
          </button>
          <button onClick={() => setDismissed(true)} className="text-[#a0c888] hover:text-[#6a9f50]">
            <LuX size={13} />
          </button>
        </>
      )}
    </div>
  );
}
