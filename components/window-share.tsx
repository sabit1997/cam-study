"use client";

import { useRef, useState, useEffect } from "react";
import {
  getStreamById,
  setStreamById,
  clearStreamById,
} from "@/utils/shareService";
import { toast } from "sonner";

interface WindowShareProps {
  isBlur: boolean;
  windowId: number;
}

export default function WindowShare({ isBlur, windowId }: WindowShareProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const ex = getStreamById(windowId);
    if (ex) {
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
      s.getVideoTracks()[0].onended = stopSharing;
      setStreamById(windowId, s);
      setStream(s);
      setStarted(true);
    } catch {
      toast.error("화면 공유를 취소했거나 사용할 수 없습니다.");
    }
  };

  const stopSharing = () => {
    clearStreamById(windowId);
    setStream(null);
    setStarted(false);
  };

  return (
    <div className="relative flex justify-center items-center w-full h-full group">
      {started ? (
        <>
          <video
            ref={videoRef}
            muted
            playsInline
            className={`group bg-black w-full h-auto ${
              isBlur ? "blur-[2px]" : ""
            }`}
            controls
          />
          <button
            onClick={stopSharing}
            className="absolute bottom-4 px-4 py-2 bg-red-500 text-[var(--text-selected)] rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
          >
            STOP
          </button>
        </>
      ) : (
        <button
          onClick={startSharing}
          className="absolute px-4 py-2 bg-dark text-[var(--text-selected)] rounded-md top-1/2 transform -translate-y-1/2"
        >
          START
        </button>
      )}
    </div>
  );
}
