"use client";

import { useEffect, useRef, useState } from "react";

interface CameraViewProps {
  isBlur: boolean;
}

const CameraView = ({ isBlur }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);

  const cleanupVideoStream = () => {
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsStreaming(false);
  };

  useEffect(() => {
    const loadDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      tempStream.getTracks().forEach((t) => t.stop());
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices
        .filter((device) => device.kind === "videoinput")
        .map((device) => ({
          id: device.deviceId,
          label: device.label || `Camera (${device.deviceId})`,
        }));

      setDevices(videoDevices);
    };

    loadDevices();
  }, []);

  useEffect(() => {
    return () => {
      cleanupVideoStream();
    };
  }, []);

  const handleStreamStart = async () => {
    if (!deviceId) {
      alert("디바이스를 선택해주세요.");
      return;
    }

    try {
      const constraints = {
        video: {
          deviceId: {
            exact: deviceId,
          },
          width: 1280,
          height: 720,
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = streamRef.current;
      videoRef.current?.play();
      setIsStreaming(true);
    } catch (err) {
      alert("카메라 접근에 실패했습니다.");
      console.error(err);
    }
  };

  return (
    <div className="w-full h-full">
      {!isStreaming && devices.length > 0 && (
        <div className="w-full h-full">
          <ul className="px-3 py-4 w-full">
            {devices.map((device) => (
              <li key={device.id}>
                <label htmlFor={device.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={device.id}
                    name="deviceId"
                    value={device.id}
                    checked={deviceId === device.id}
                    onChange={() => setDeviceId(device.id)}
                  />
                  {device.label}
                </label>
              </li>
            ))}
          </ul>
          <button
            className="block py-2 w-16 bg-dark text-[var(--text-selected)] rounded-md mx-auto"
            type="button"
            onClick={handleStreamStart}
          >
            Start
          </button>
        </div>
      )}

      {!isStreaming && devices.length === 0 && (
        <span>디바이스가 없습니다.</span>
      )}

      {isStreaming && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-auto bg-black ${isBlur ? "blur-sm" : ""}`}
        />
      )}
    </div>
  );
};

export default CameraView;
