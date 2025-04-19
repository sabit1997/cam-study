"use client";

import { useRef, useState, useEffect } from "react";

const WindowShare = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [started, setStarted] = useState(false);

  const handleStartSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
      });

      streamRef.current = stream;
      setStarted(true);

      const [track] = stream.getVideoTracks();
      track.onended = () => stopSharing();
    } catch (err) {
      console.error("화면 공유 실패:", err);
      alert("화면 공유를 취소했거나 사용할 수 없습니다.");
    }
  };

  const stopSharing = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStarted(false);
  };

  useEffect(() => {
    if (started && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current
        .play()
        .catch((err) => console.error("video 재생 실패:", err));
    }
  }, [started]);

  return (
    <div className="flex justify-center items-center w-full h-auto">
      {started ? (
        <>
          <video
            ref={videoRef}
            muted
            playsInline
            className="bg-black w-full h-auto"
            controls
          />
          <button
            onClick={stopSharing}
            className="absolute bottom-4 px-4 py-2 bg-red-500 text-white rounded-md"
          >
            STOP
          </button>
        </>
      ) : (
        <button
          onClick={handleStartSharing}
          className="absolute px-4 py-2 bg-[#255f38] text-white rounded-md top-1/2 transform -translate-y-1/2"
        >
          START
        </button>
      )}
    </div>
  );
};

export default WindowShare;
