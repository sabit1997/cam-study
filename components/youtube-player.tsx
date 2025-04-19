"use client";

import YouTube from "react-youtube";
import { useState, useEffect } from "react";
import { Window } from "@/types/windows";
import { usePatchWindow } from "@/apis/services/window-services/mutation";
import { RiResetLeftLine } from "react-icons/ri";

interface YouTubePlayerProps {
  window: Window;
}

const YouTubePlayer = ({ window }: YouTubePlayerProps) => {
  const { mutate: updateWindow } = usePatchWindow();

  const [inputUrl, setInputUrl] = useState(window.url ?? "");
  const [isSubmitted, setIsSubmitted] = useState(!!window.url);

  useEffect(() => {
    setInputUrl(window.url ?? "");
    setIsSubmitted(!!window.url);
  }, [window.url]);

  const handleSubmit = () => {
    if (inputUrl.includes("youtube.com/watch")) {
      updateWindow({ id: window.id, data: { url: inputUrl.trim() } });
      setIsSubmitted(true);
    } else {
      alert("유효한 유튜브 링크를 입력해주세요.");
    }
  };

  const handleReset = () => {
    setInputUrl("");
    setIsSubmitted(false);
  };

  const videoId = inputUrl.includes("v=")
    ? inputUrl.split("v=")[1]?.split("&")[0]
    : null;

  if (!isSubmitted) {
    return (
      <div className="flex flex-col justify-center items-center gap-3 p-3">
        <p>유튜브 링크를 입력해주세요:</p>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full mb-2 p-2 rounded border border-[#ccc]"
        />
        <button
          onClick={handleSubmit}
          className="px-4 py-2 rounded bg-[#255f38] text-white border-none cursor-pointer"
        >
          DONE
        </button>
      </div>
    );
  }

  if (!videoId)
    return (
      <div className="w-full h-full flex justify-center items-center gap-2">
        <p>유튜브 링크 오류</p>
        <button
          type="button"
          className="w-6 h-6 bg-red-500 rounded-full flex justify-center items-center"
          onClick={handleReset}
        >
          <RiResetLeftLine className="text-white" />
        </button>
      </div>
    );

  return (
    <div className="relative">
      <YouTube
        videoId={videoId}
        opts={{
          width: "100%",
          playerVars: {
            autoplay: 1,
          },
        }}
      />
      <button
        type="button"
        className="w-6 h-6 bg-red-500 rounded-full absolute top-0.5 left-0.5 flex justify-center items-center"
        onClick={handleReset}
      >
        <RiResetLeftLine className="text-white" />
      </button>
    </div>
  );
};

export default YouTubePlayer;
