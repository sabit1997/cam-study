"use client";

import { useEffect, useState } from "react";
import { LuDownload, LuRefreshCw, LuX } from "react-icons/lu";

type UpdateState =
  | { phase: "idle" }
  | { phase: "available"; version: string; releaseNotes: string | null }
  | { phase: "downloading"; percent: number }
  | { phase: "ready" };

export default function UpdateNotifier() {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    const offAvailable = window.electronAPI.on("update:available", (payload) => {
      const p = payload as { version: string; releaseNotes: string | null };
      setState({ phase: "available", version: p.version, releaseNotes: p.releaseNotes });
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

  // ready 단계는 dismissed 상태와 무관하게 항상 표시 (재시작 유도가 목적)
  if (state.phase === "idle") return null;
  if (dismissed && state.phase !== "ready") return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 px-4 py-3 rounded-2xl shadow-xl text-sm"
      style={{
        background: "linear-gradient(135deg, #f0f7ea, #e8f3e0)",
        border: "1px solid #c8e0b8",
        minWidth: 260,
        maxWidth: 320,
      }}
    >
      {state.phase === "available" && (
        <>
          <div className="flex items-center gap-3">
            <LuDownload size={16} className="text-[#6a9f50] flex-shrink-0" />
            <div className="flex-1 leading-snug">
              <p className="font-semibold text-[#3d6b28] text-xs">새 버전 {state.version}</p>
              <p className="text-[11px] text-[#6a9f50]">백그라운드에서 다운로드 중...</p>
            </div>
            <button onClick={() => setDismissed(true)} className="text-[#a0c888] hover:text-[#6a9f50]">
              <LuX size={13} />
            </button>
          </div>
          {state.releaseNotes && (
            <div
              className="text-[11px] text-[#4a7a35] leading-relaxed max-h-32 overflow-y-auto rounded-lg px-2.5 py-2"
              style={{ background: "rgba(255,255,255,0.5)", whiteSpace: "pre-wrap" }}
            >
              {state.releaseNotes}
            </div>
          )}
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
        <div className="flex items-center gap-3">
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
        </div>
      )}
    </div>
  );
}
