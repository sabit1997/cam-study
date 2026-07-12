"use client";

import { useEffect, useRef, useState } from "react";
import { LuDownload, LuRefreshCw, LuX } from "react-icons/lu";

type UpdateState =
  | { phase: "idle" }
  | { phase: "available"; version: string; releaseNotes: string | null }
  | { phase: "downloading"; percent: number }
  | { phase: "ready" }
  | { phase: "error"; message: string };

const DISMISSED_KEY = "update-notifier-dismissed-version";

function isDismissedVersion(version: string) {
  try { return localStorage.getItem(DISMISSED_KEY) === version; } catch { return false; }
}
function saveDismissedVersion(version: string) {
  try { localStorage.setItem(DISMISSED_KEY, version); } catch { /* ignore */ }
}
function clearDismissedVersion() {
  try { localStorage.removeItem(DISMISSED_KEY); } catch { /* ignore */ }
}

export default function UpdateNotifier() {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const [dismissed, setDismissed] = useState(false);
  // available/downloading 단계에서 버전 추적 (dismiss 저장용)
  const pendingVersion = useRef<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    // 마운트 시 이미 완료된 업데이트 상태 조회 (IPC 메시지를 놓쳤을 경우 복구)
    window.electronAPI.checkUpdateState?.().then((s) => {
      if (!s) return;
      if (s.phase === "ready") {
        // ready는 항상 표시 (재시작 유도가 목적)
        clearDismissedVersion();
        setState({ phase: "ready" });
        setDismissed(false);
      } else if (s.phase === "downloading") {
        setState({ phase: "downloading", percent: s.percent });
        setDismissed(false);
      } else if (s.phase === "available") {
        pendingVersion.current = s.version;
        setState({ phase: "available", version: s.version, releaseNotes: s.releaseNotes });
        // 이전에 이 버전을 이미 닫은 경우 다시 띄우지 않음
        setDismissed(isDismissedVersion(s.version));
      }
    });

    const offAvailable = window.electronAPI.on("update:available", (payload) => {
      const p = payload as { version: string; releaseNotes: string | null };
      pendingVersion.current = p.version;
      setState({ phase: "available", version: p.version, releaseNotes: p.releaseNotes });
      setDismissed(isDismissedVersion(p.version));
    });
    const offProgress = window.electronAPI.on("update:progress", (percent) => {
      setState({ phase: "downloading", percent: percent as number });
    });
    const offReady = window.electronAPI.on("update:downloaded", () => {
      // 다운로드 완료: dismissed 기록 지우고 항상 표시
      clearDismissedVersion();
      setState({ phase: "ready" });
      setDismissed(false);
    });
    const offError = window.electronAPI.on("update:error", (message) => {
      setState({ phase: "error", message: message as string });
      setDismissed(false);
    });

    return () => { offAvailable(); offProgress(); offReady(); offError(); };
  }, []);

  function dismissCurrent() {
    if (pendingVersion.current) saveDismissedVersion(pendingVersion.current);
    setDismissed(true);
  }

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
              <p className="text-[11px] text-[#6a9f50]">자동으로 다운로드됩니다</p>
            </div>
            <button onClick={dismissCurrent} className="text-[#a0c888] hover:text-[#6a9f50]">
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
        <div className="flex items-center gap-3">
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
          <button onClick={dismissCurrent} className="text-[#a0c888] hover:text-[#6a9f50]">
            <LuX size={13} />
          </button>
        </div>
      )}

      {state.phase === "error" && (
        <div className="flex items-center gap-3">
          <LuX size={16} className="text-red-400 flex-shrink-0" />
          <div className="flex-1 leading-snug">
            <p className="font-semibold text-[#3d6b28] text-xs">업데이트 실패</p>
            <p className="text-[11px] text-[#6a9f50]">
              <a href="/download" className="underline hover:text-[#3d6b28]">
                수동으로 다운로드
              </a>
              하거나 나중에 다시 시도해 주세요
            </p>
          </div>
          <button onClick={() => setDismissed(true)} className="text-[#a0c888] hover:text-[#6a9f50]">
            <LuX size={13} />
          </button>
        </div>
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

