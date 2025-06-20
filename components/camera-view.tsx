"use client";

import { useEffect, useRef } from "react";

interface CameraViewProps {
  isBlur: boolean;
}

const CameraView = ({ isBlur }: CameraViewProps) => {
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
    videoElement.srcObject = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    const currentVideoElement = videoRef.current;

    const initializeCamera = async () => {
      try {
        if (!currentVideoElement) return;

        const stream = await getCameraStream();
        streamRef.current = stream;
        setupVideoStream(currentVideoElement, stream);
      } catch (err) {
        if (err instanceof DOMException) {
          switch (err.name) {
            case "NotAllowedError":
              console.error("사용자가 카메라 사용을 거부했습니다.");
              break;
            case "NotFoundError":
              console.error("사용할 수 있는 카메라를 찾을 수 없습니다.");
              break;
            default:
              console.error("카메라 접근 중 DOMException 발생:", err);
          }
        } else {
          console.error("카메라 초기화 중 알 수 없는 오류:", err);
        }
      }
    };

    initializeCamera();

    return () => {
      if (currentVideoElement) {
        cleanupVideoStream(currentVideoElement);
      }
    };
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      className={`w-full h-auto bg-black ${isBlur ? "blur-xs" : ""}`}
    />
  );
};

export default CameraView;
