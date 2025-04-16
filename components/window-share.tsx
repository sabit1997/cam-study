"use client";

import { useRef, useState } from "react";

type ExtendedVideoConstraints = MediaTrackConstraints & {
  displaySurface?: "window" | "application" | "browser" | "monitor";
  cursor?: "always" | "motion" | "never";
};

const WindowShare = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [started, setStarted] = useState(false);

  const handleStartSharing = async () => {
    try {
      const videoConstraints: ExtendedVideoConstraints = {
        displaySurface: "window",
        cursor: "always",
      };

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;

        video.onloadedmetadata = () => {
          video.play().catch((err) => {
            console.error("video play 실패:", err);
          });
        };
      }

      const [track] = stream.getVideoTracks();
      track.onended = () => {
        console.log("사용자가 브라우저에서 공유를 중단했습니다.");
        stopSharing();
      };

      setStarted(true);
    } catch (err) {
      console.error("화면 공유 실패:", err);
      alert("화면 공유를 취소했거나 사용할 수 없습니다.");
    }
  };

  const stopSharing = () => {
    const stream = streamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setStarted(false);
  };

  return (
    <div className="flex justify-center items-center w-full h-auto">
      {started ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="bg-black w-full h-auto min-w-180"
          />
          <button
            onClick={stopSharing}
            className="mt-4 px-3 py-2 bg-[#ff5252] text-white border-none rounded-md cursor-pointer absolute bottom-2 left-1/2 transform -translate-x-1/2"
          >
            STOP
          </button>
        </>
      ) : (
        <>
          <button
            onClick={handleStartSharing}
            className="px-4 py-2 bg-[#255f38] text-white border-none rounded-md cursor-pointer absolute left-1/2 top-1/2 -transform -translate-1/2"
          >
            START
          </button>
        </>
      )}
    </div>
  );
};

export default WindowShare;
