"use client";

import YouTube from "react-youtube";
import { useState, useEffect } from "react";
import { useUpdateWindow } from "@/hooks/useWindows";
import { WindowData } from "@/types/windows";

interface YouTubePlayerProps {
  window: WindowData;
}

const YouTubePlayer = ({ window }: YouTubePlayerProps) => {
  const { mutate: updateWindow } = useUpdateWindow();

  const [inputUrl, setInputUrl] = useState("");

  useEffect(() => {
    if (!window?.url) {
      setInputUrl("");
    }
  }, [window?.url]);

  if (!window) return null;

  const videoId =
    window.url && window.url.includes("v=")
      ? window.url.split("v=")[1]?.split("&")[0]
      : null;

  const handleSubmit = () => {
    if (inputUrl.includes("youtube.com/watch")) {
      updateWindow({ id: window.id, updates: { url: inputUrl.trim() } });
    } else {
      alert("유효한 유튜브 링크를 입력해주세요.");
    }
  };

  if (!window.url || window.url.trim() === "") {
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

  if (!videoId) return <p>유튜브 링크 오류</p>;

  return (
    <YouTube
      videoId={videoId}
      opts={{
        width: "100%",
        playerVars: {
          autoplay: 1,
        },
      }}
    />
  );
};

export default YouTubePlayer;
