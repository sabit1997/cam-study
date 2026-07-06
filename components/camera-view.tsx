"use client";

import { useEffect, useRef, useState } from "react";
import { FiCamera, FiEye, FiEyeOff, FiX } from "react-icons/fi";
import { toast } from "sonner";

const CAM_DEVICE_LS_KEY = "cam-device-id";

const CameraView = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isBlur, setIsBlur] = useState(false);
  const [blurAmount, setBlurAmount] = useState(4);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const loadDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        tempStream.getTracks().forEach((t) => t.stop());
      } catch {
        toast.error(
          "카메라 접근 권한이 없습니다. 브라우저 설정을 확인해주세요."
        );
        return;
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = all.filter((d) => d.kind === "videoinput");
      setDevices(videoDevices);
      const saved = localStorage.getItem(CAM_DEVICE_LS_KEY) ?? "";
      if (saved && videoDevices.some((d) => d.deviceId === saved)) {
        setDeviceId(saved);
      } else if (videoDevices.length > 0) {
        setDeviceId(videoDevices[0].deviceId);
      }
    };
    loadDevices();
    return () => stopStream();
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsStreaming(false);
  };

  const startStream = async (id?: string) => {
    const targetId = id ?? deviceId;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: targetId
          ? {
              deviceId: { exact: targetId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setIsStreaming(true);
      const track = stream.getVideoTracks()[0];
      const trackId = track?.getSettings().deviceId;
      if (trackId) {
        setDeviceId(trackId);
        localStorage.setItem(CAM_DEVICE_LS_KEY, trackId);
      }
    } catch {
      toast.error("카메라 접근에 실패했습니다.");
    }
  };

  const handleDeviceChange = (id: string) => {
    setDeviceId(id);
    localStorage.setItem(CAM_DEVICE_LS_KEY, id);
    if (isStreaming) {
      stopStream();
      setTimeout(() => startStream(id), 100);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Video area */}
      <div className="flex-1 bg-black relative overflow-hidden">
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)",
          }}
        />
        {isBlur && (
          <div
            className="absolute inset-0"
            style={{ backdropFilter: `blur(${blurAmount}px)` }}
          />
        )}
        {!isStreaming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
            <FiCamera size={36} className="opacity-20 mb-2" />
            <p className="text-xs opacity-40">카메라 꺼짐</p>
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="px-3 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-2 flex-wrap">
        <button
          onClick={isStreaming ? stopStream : () => startStream()}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium text-white transition-colors"
          style={{ background: isStreaming ? "#ff3b30" : "#8fb870" }}
        >
          {isStreaming ? (
            <>
              <FiX size={11} />
              중지
            </>
          ) : (
            <>
              <FiCamera size={11} />
              시작
            </>
          )}
        </button>
        <button
          onClick={() => setIsBlur((b) => !b)}
          disabled={!isStreaming}
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
        {isBlur && (
          <input
            type="range"
            min={1}
            max={20}
            value={blurAmount}
            onChange={(e) => setBlurAmount(Number(e.target.value))}
            className="w-20 accent-gray-500"
            title={`블러 강도: ${blurAmount}px`}
          />
        )}
        {devices.length > 1 && (
          <select
            value={deviceId}
            onChange={(e) => handleDeviceChange(e.target.value)}
            className="text-xs flex-1 min-w-0 rounded-lg border border-gray-200 py-1 px-1.5 bg-white text-gray-600 outline-none"
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};

export default CameraView;
