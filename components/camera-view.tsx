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

  const getCameraStream = async (id: string): Promise<MediaStream> => {
    return await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: id } },
    });
  };

  const setupVideoStream = (stream: MediaStream) => {
    if (!videoRef.current) return;

    videoRef.current.srcObject = stream;
    videoRef.current.onloadedmetadata = () => {
      videoRef.current?.play();
    };
  };

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
      const stream = await getCameraStream(deviceId);
      streamRef.current = stream;
      setupVideoStream(stream);
      setIsStreaming(true);
    } catch (err) {
      alert("카메라 접근에 실패했습니다.");
      console.error(err);
    }
  };

  return (
    <div>
      {!isStreaming && devices.length > 0 && (
        <div>
          <ul>
            {devices.map((device) => (
              <li key={device.id}>
                <label htmlFor={device.id}>
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
          <button type="button" onClick={handleStreamStart}>
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
