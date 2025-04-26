"use client";

import { useEffect, useRef } from "react";

const CameraView = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const getCameraStream = async (): Promise<MediaStream> => {
    return await navigator.mediaDevices.getUserMedia({
      video: true,
    });
  };

  const setupVideoStream = (
    videoElement: HTMLVideoElement,
    stream: MediaStream
  ) => {
    videoElement.srcObject = stream;
    videoElement.addEventListener("loadedmetadata", () => {
      videoElement.play().catch((err) => {
        console.error("video.play() 실패:", err);
      });
    });
  };

  const cleanupVideoStream = (videoElement: HTMLVideoElement) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    videoElement.srcObject = null;
  };

  useEffect(() => {
    const initializeCamera = async () => {
      try {
        const videoElement = videoRef.current;
        if (!videoElement) return;

        const stream = await getCameraStream();

        streamRef.current = stream;
        setupVideoStream(videoElement, stream);
      } catch (err) {
        console.error("카메라 초기화 실패:", err);
      }
    };

    initializeCamera();

    return () => {
      const videoElement = videoRef.current;
      if (videoElement) {
        cleanupVideoStream(videoElement);
      }
    };
  }, []);

  return (
    <video ref={videoRef} autoPlay muted className="w-full h-auto bg-black" />
  );
};

export default CameraView;
