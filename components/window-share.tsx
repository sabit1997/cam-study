"use client";

import { useRef, useState, useEffect } from "react";
import { FiMonitor, FiEye, FiEyeOff, FiX } from "react-icons/fi";
import {
  getStreamById,
  setStreamById,
  clearStreamById,
} from "@/utils/shareService";
import { toast } from "sonner";

interface WindowShareProps {
  windowId: number;
  onRatioChange?: (ratio: number) => void;
}

export default function WindowShare({ windowId, onRatioChange }: WindowShareProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [started, setStarted] = useState(false);
  const [isBlur, setIsBlur] = useState(false);

  useEffect(() => {
    const ex = getStreamById(windowId);
    if (ex) {
      streamRef.current = ex;
      setStream(ex);
      setStarted(true);
    }
    return () => {
      clearStreamById(windowId);
    };
  }, [windowId]);

  useEffect(() => {
    if (started && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [started, stream]);

  const startSharing = async () => {
    if (stream) {
      setStarted(true);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streamRef.current = s;
      const track = s.getVideoTracks()[0];
      track.addEventListener("ended", stopSharing);
      const settings = track?.getSettings();
      if (settings?.width && settings?.height && onRatioChange) {
        onRatioChange(settings.width / settings.height);
      }
      setStreamById(windowId, s);
      setStream(s);
      setStarted(true);
    } catch {
      toast.error("화면 공유를 취소했거나 사용할 수 없습니다.");
    }
  };

  const stopSharing = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    clearStreamById(windowId);
    setStream(null);
    setStarted(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Video area */}
      <div className="flex-1 bg-gray-900 relative overflow-hidden">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-contain"
          style={{ filter: isBlur ? "blur(18px)" : "none" }}
        />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
            <FiMonitor size={36} className="opacity-20 mb-2" />
            <p className="text-xs opacity-40">화면 공유 안 함</p>
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="px-3 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
        <button
          onClick={started ? stopSharing : startSharing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium text-white transition-colors"
          style={{ background: started ? "#ff3b30" : "#8fb870" }}
        >
          {started ? (
            <>
              <FiX size={11} />
              중지
            </>
          ) : (
            <>
              <FiMonitor size={11} />
              화면 공유
            </>
          )}
        </button>
        <button
          onClick={() => setIsBlur((b) => !b)}
          disabled={!started}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
        >
          {isBlur ? (
            <>
              <FiEye size={11} />
              블러 해제
            </>
          ) : (
            <>
              <FiEyeOff size={11} />
              블러
            </>
          )}
        </button>
      </div>
    </div>
  );
}
