"use client";

import { useRef, useState, useEffect } from "react";
import {
  getStreamById,
  setStreamById,
  clearStreamById,
} from "@/utils/shareService";
import Image from "next/image";

interface WindowShareProps {
  isBlur: boolean;
  windowId: number;
}

type DesktopCaptureSource = {
  id: string;
  name: string;
  thumbnail: { toDataURL(): string };
};

export default function WindowShare({ isBlur, windowId }: WindowShareProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [started, setStarted] = useState(false);

  const [sources, setSources] = useState<DesktopCaptureSource[]>([]);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    const ex = getStreamById(windowId);
    if (ex) {
      setStream(ex);
      setStarted(true);
    }
  }, [windowId]);

  useEffect(() => {
    if (started && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(console.error);
    }
  }, [started, stream]);

  const startSharing = async () => {
    if (stream) {
      setStarted(true);
      return;
    }

    console.log(typeof window.electronAPI);

    if (typeof window.electronAPI !== "undefined") {
      try {
        const list = await window.electronAPI.getSources({
          types: ["window", "screen"],
        });
        setSources(list);
        setSelecting(true);
      } catch {
        alert("소스 목록을 불러오지 못했습니다.");
      }
      return;
    }

    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ audio: false });
      s.getVideoTracks()[0].onended = stopSharing;
      setStreamById(windowId, s);
      setStream(s);
      setStarted(true);
    } catch {
      alert("화면 공유를 취소했거나 사용할 수 없습니다.");
    }
  };

  const selectSource = async (sourceId: string) => {
    setSelecting(false);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
            maxWidth: window.screen.width,
            maxHeight: window.screen.height,
          },
        },
      });
      s.getVideoTracks()[0].onended = stopSharing;
      setStreamById(windowId, s);
      setStream(s);
      setStarted(true);
    } catch {
      alert("공유 시작에 실패했습니다.");
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
            className={`bg-black w-full h-auto ${isBlur ? "blur-[2px]" : ""}`}
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

      {selecting && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-80 max-h-[70vh] overflow-auto">
            <h2 className="mb-4 text-lg font-semibold">화면/창 선택</h2>
            <ul>
              {sources.map((src) => (
                <li
                  key={src.id}
                  onClick={() => selectSource(src.id)}
                  className="flex items-center mb-2 cursor-pointer hover:bg-gray-100 p-2 rounded"
                >
                  <Image
                    src={src.thumbnail.toDataURL()}
                    alt={src.name}
                    className="w-12 h-8 mr-3 object-cover"
                  />
                  <span>{src.name}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setSelecting(false)}
              className="mt-4 px-3 py-1 bg-gray-300 rounded"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
