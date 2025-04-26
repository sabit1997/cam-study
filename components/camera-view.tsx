"use client";

import { useEffect, useRef } from "react";

const CameraView = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleLoadedMetadata = () => {
      videoElement.play().catch((err) => {
        console.error("video.play() 실패:", err);
      });
    };

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
      } catch (err) {
        console.error("카메라 접근 실패!:", err);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      videoElement.srcObject = null;
      videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, []);

  return (
    <video ref={videoRef} autoPlay muted className="w-full h-auto bg-black" />
  );
};

export default CameraView;
