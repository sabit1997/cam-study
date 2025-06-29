"use client";

import YouTube, { YouTubeProps } from "react-youtube";
import { useState, useEffect, useRef, useCallback } from "react";
import { Window } from "@/types/windows";
import { usePatchWindow } from "@/apis/services/window-services/mutation";
import { RiResetLeftLine } from "react-icons/ri";
import { MdDeleteForever } from "react-icons/md";
import { extractYouTubeId } from "@/utils/extractYouTubeId";
import { IoMdAddCircleOutline } from "react-icons/io";

interface YouTubePlayerProps {
  window: Window;
}

const YouTubePlayer = ({ window }: YouTubePlayerProps) => {
  const { mutate: updateWindow, isPending } = usePatchWindow();
  const [inputs, setInputs] = useState<string[]>([""]);
  const [playlist, setPlaylist] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const playerRef = useRef<YT.Player | null>(null);

  useEffect(() => {
    if (Array.isArray(window.url) && window.url.length) {
      const ids = window.url
        .map((fullUrl) => extractYouTubeId(fullUrl))
        .filter((id): id is string => !!id);
      if (ids.length) {
        const fullUrls = ids.map(
          (id) => `https://www.youtube.com/watch?v=${id}`
        );
        setInputs(fullUrls);
        setPlaylist(ids);
        setCurrentIndex(0);
        setIsSubmitted(true);
      }
    }
  }, [window.url]);

  const handleInputChange = useCallback((index: number, value: string) => {
    setInputs((prev) => prev.map((v, i) => (i === index ? value : v)));
  }, []);

  const handleAddInput = useCallback(() => {
    setInputs((prev) => [...prev, ""]);
  }, []);

  const handleRemoveInput = useCallback((index: number) => {
    setInputs((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev
    );
  }, []);

  const handleSubmit = useCallback(() => {
    if (isPending) return;
    const ids = inputs
      .map((url) => extractYouTubeId(url.trim()))
      .filter((id): id is string => !!id);
    if (!ids.length) {
      alert("유효한 링크를 하나 이상 입력해주세요.");
      return;
    }
    const fullUrls = ids.map((id) => `https://www.youtube.com/watch?v=${id}`);
    updateWindow({ id: window.id, data: { url: fullUrls } });
    setInputs(fullUrls);
    setPlaylist(ids);
    setCurrentIndex(0);
    setIsSubmitted(true);
  }, [inputs, isPending, updateWindow, window.id]);

  const handleReset = useCallback(() => {
    setIsSubmitted(false);
    setCurrentIndex(0);
  }, []);

  const onPlayerReady: YouTubeProps["onReady"] = (event) => {
    playerRef.current = event.target;
    event.target.playVideo();
  };

  const onPlayerEnd: YouTubeProps["onEnd"] = () => {
    if (!playerRef.current || playlist.length === 0) return;
    const nextIdx = (currentIndex + 1) % playlist.length;
    setCurrentIndex(nextIdx);
    playerRef.current.loadVideoById(playlist[nextIdx]);
  };

  const videoId = playlist[currentIndex] ?? null;

  if (!isSubmitted) {
    return (
      <div className="flex flex-col items-center gap-3 p-3 h-full">
        <p>유튜브 링크를 입력해주세요:</p>
        <div className="w-full overflow-y-auto">
          {inputs.map((value, idx) => (
            <div
              key={idx}
              className="w-full flex items-center gap-2 mb-2 p-2 border rounded"
            >
              <input
                type="text"
                value={value}
                onChange={(e) => handleInputChange(idx, e.target.value)}
                placeholder="https://youtu.be/... 또는 https://www.youtube.com/watch?v=..."
                className="flex-1 border-none outline-none"
              />
              <button
                onClick={() => handleRemoveInput(idx)}
                aria-label="delete"
              >
                <MdDeleteForever size={20} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAddInput}
            className="px-3 py-1 border rounded"
            aria-label="add"
          >
            <IoMdAddCircleOutline />
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-2 rounded bg-dark text-white disabled:opacity-50"
          >
            {isPending ? "Applying..." : "Apply"}
          </button>
        </div>
      </div>
    );
  }

  if (!videoId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p>유튜브 링크 오류</p>
        <button onClick={handleReset}>
          <RiResetLeftLine size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <YouTube
        videoId={videoId}
        opts={{ width: "100%", height: "100%", playerVars: { autoplay: 1 } }}
        onReady={onPlayerReady}
        onEnd={onPlayerEnd}
        className="w-full h-full"
        iframeClassName="w-full h-full"
      />
      <button
        onClick={handleReset}
        className="absolute top-1 left-1 p-1 bg-red-500 rounded-full"
      >
        <RiResetLeftLine className="text-white" size={16} />
      </button>
    </div>
  );
};

export default YouTubePlayer;
