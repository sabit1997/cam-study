"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { FiMonitor, FiEye, FiEyeOff, FiX } from "react-icons/fi";
import {
  getStreamById,
  setStreamById,
  clearStreamById,
} from "@/utils/shareService";
import { toast } from "sonner";

interface WindowShareProps {
  windowId: number;
  onAspectRatioDetected?: (ratio: number) => void;
}

export default function WindowShare({ windowId, onAspectRatioDetected }: WindowShareProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [started, setStarted] = useState(false);
  const [isBlur, setIsBlur] = useState(false);
  const [blurAmount, setBlurAmount] = useState(4);
  const [isPickerLoading, setIsPickerLoading] = useState(false);

  // track.getSettings()로 스트림 비율 감지 후 부모에게 전달
  const reportAspectRatio = useCallback(
    (s: MediaStream) => {
      const track = s.getVideoTracks()[0];
      if (!track) return;
      const { width, height } = track.getSettings();
      if (width && height) onAspectRatioDetected?.(width / height);
    },
    [onAspectRatioDetected]
  );

  // loadedmetadata fallback — track.getSettings()가 0을 반환하는 브라우저 대비
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => {
      const { videoWidth: vw, videoHeight: vh } = video;
      if (vw && vh) onAspectRatioDetected?.(vw / vh);
    };
    video.addEventListener("loadedmetadata", handler);
    return () => video.removeEventListener("loadedmetadata", handler);
  }, [onAspectRatioDetected]);

  useEffect(() => {
    const ex = getStreamById(windowId);
    if (ex) {
      streamRef.current = ex;
      setStream(ex);
      setStarted(true);
      reportAspectRatio(ex);
    }
    return () => {
      clearStreamById(windowId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setIsPickerLoading(true);
    const stopWaitingForPicker = window.electronAPI?.on(
      "screen-picker:open",
      () => setIsPickerLoading(false)
    );
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      streamRef.current = s;
      const track = s.getVideoTracks()[0];
      track.addEventListener("ended", stopSharing);
      setStreamById(windowId, s);
      setStream(s);
      setStarted(true);
      // 신규 스트림 비율 즉시 감지
      reportAspectRatio(s);
    } catch {
      toast.error("화면 공유를 취소했거나 사용할 수 없습니다.");
    } finally {
      stopWaitingForPicker?.();
      setIsPickerLoading(false);
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
    <div className="relative h-full">
      {/* 비디오: 전체 영역 차지 — 창 비율이 스트림 비율과 일치하므로 object-cover로 여백 없이 채움 */}
      <div className="absolute inset-0 bg-gray-900">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        {isBlur && (
          <div
            className="absolute inset-0"
            style={{ backdropFilter: `blur(${blurAmount}px)` }}
          />
        )}
        {isPickerLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
            <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin mb-2" />
            <p className="text-xs opacity-40">공유할 화면 불러오는 중...</p>
          </div>
        ) : (
          !started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
              <FiMonitor size={36} className="opacity-20 mb-2" />
              <p className="text-xs opacity-40">화면 공유 안 함</p>
            </div>
          )
        )}
      </div>

      {/* 컨트롤바: 스트림 없을 때는 항상 표시, 있을 때는 hover 시 표시 */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center gap-2
                    bg-gradient-to-t from-black/50 to-transparent
                    transition-opacity duration-200
                    ${started ? "opacity-0 hover:opacity-100" : "opacity-100"}`}
      >
        <button
          onClick={started ? stopSharing : startSharing}
          disabled={isPickerLoading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border border-white/30 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
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
        {isBlur && (
          <input
            type="range"
            min={1}
            max={20}
            value={blurAmount}
            onChange={(e) => setBlurAmount(Number(e.target.value))}
            className="w-20 accent-white"
            title={`블러 강도: ${blurAmount}px`}
          />
        )}
      </div>
    </div>
  );
}
