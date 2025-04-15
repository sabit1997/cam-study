"use client";

import { useWindowStore } from "@/stores/window-state";
import YouTube from "react-youtube";
import { useState, useEffect } from "react";

interface YouTubePlayerProps {
  id: number;
}

const YouTubePlayer = ({ id }: YouTubePlayerProps) => {
  const window = useWindowStore((state) =>
    state.windows.find((w) => w.id === id)
  );
  const updateUrl = useWindowStore((state) => state.updateYoutubeUrl);

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
      updateUrl(id, inputUrl.trim());
    } else {
      alert("유효한 유튜브 링크를 입력해주세요.");
    }
  };

  if (!window.url || window.url.trim() === "") {
    return (
      <div style={{ padding: "1rem" }}>
        <p>유튜브 링크를 입력해주세요:</p>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          style={{
            width: "100%",
            marginBottom: "0.5rem",
            padding: "0.5rem",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        />
        <button
          onClick={handleSubmit}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            backgroundColor: "#0070f3",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          확인
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
