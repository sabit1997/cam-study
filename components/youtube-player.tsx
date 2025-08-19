"use client";

import YouTube, { YouTubeProps } from "react-youtube";
import { useState, useEffect, useRef, useCallback } from "react";
import { Window } from "@/types/windows";
import { usePatchWindow } from "@/apis/services/window-services/mutation";
import { RiResetLeftLine } from "react-icons/ri";
import { MdDeleteForever, MdErrorOutline } from "react-icons/md";
import { extractYouTubeId } from "@/utils/extractYouTubeId";
import { IoMdAddCircleOutline } from "react-icons/io";

interface YouTubePlayerProps {
  window: Window;
}

interface InputState {
  value: string;
  isEmbeddable: boolean | null;
  isLoading: boolean;
}

const YouTubePlayer = ({ window }: YouTubePlayerProps) => {
  const { mutate: updateWindow, isPending } = usePatchWindow();
  const [inputs, setInputs] = useState<InputState[]>([
    { value: "", isEmbeddable: null, isLoading: false },
  ]);
  const [playlist, setPlaylist] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const playerRef = useRef<YT.Player | null>(null);

  useEffect(() => {
    if (Array.isArray(window.url) && window.url.length > 0) {
      const ids = window.url
        .map((fullUrl) => extractYouTubeId(fullUrl))
        .filter((id): id is string => !!id);
      if (ids.length > 0) {
        const fullUrls = ids.map(
          (id) => `https://www.youtube.com/watch?v=${id}`
        );
        setInputs(
          fullUrls.map((url) => ({
            value: url,
            isEmbeddable: true,
            isLoading: false,
          }))
        );
        setPlaylist(ids);
        setCurrentIndex(0);
        setIsSubmitted(true);
      }
    }
  }, [window.url]);

  const handleInputChange = useCallback((index: number, value: string) => {
    setInputs((prev) =>
      prev.map((input, i) =>
        i === index ? { ...input, value, isEmbeddable: null } : input
      )
    );
  }, []);

  const checkEmbeddable = useCallback(
    async (index: number) => {
      const url = inputs[index].value.trim();
      if (inputs[index].isEmbeddable !== null || !url) return;

      const videoId = extractYouTubeId(url);

      if (!videoId) {
        if (url) {
          setInputs((prev) =>
            prev.map((input, i) =>
              i === index ? { ...input, isEmbeddable: false } : input
            )
          );
        }
        return;
      }

      setInputs((prev) =>
        prev.map((input, i) =>
          i === index ? { ...input, isLoading: true } : input
        )
      );

      try {
        const response = await fetch("/api/check-youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId }),
        });
        if (!response.ok) throw new Error("API call failed");
        const data = await response.json();
        setInputs((prev) =>
          prev.map((input, i) =>
            i === index
              ? { ...input, isEmbeddable: data.isEmbeddable, isLoading: false }
              : input
          )
        );
      } catch (error) {
        console.error("Failed to check embed status:", error);
        setInputs((prev) =>
          prev.map((input, i) =>
            i === index
              ? { ...input, isEmbeddable: false, isLoading: false }
              : input
          )
        );
      }
    },
    [inputs]
  );

  const handleAddInput = useCallback(() => {
    setInputs((prev) => [
      ...prev,
      { value: "", isEmbeddable: null, isLoading: false },
    ]);
  }, []);

  const handleRemoveInput = useCallback((index: number) => {
    setInputs((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev
    );
  }, []);

  const handleSubmit = useCallback(() => {
    if (isPending) return;

    const checks = inputs.map((input, index) => {
      if (input.isEmbeddable === null && input.value.trim()) {
        return checkEmbeddable(index);
      }
      return Promise.resolve();
    });

    Promise.all(checks).then(() => {
      setInputs((currentInputs) => {
        const validLinks = currentInputs.filter(
          (input) => input.isEmbeddable === true
        );

        if (validLinks.length === 0) {
          alert("재생 가능한 유효한 링크를 하나 이상 입력해주세요.");
          return currentInputs;
        }

        const ids = validLinks
          .map((input) => extractYouTubeId(input.value.trim()))
          .filter((id): id is string => !!id);

        const fullUrls = ids.map(
          (id) => `https://www.youtube.com/watch?v=${id}`
        );

        updateWindow({ id: window.id, data: { url: fullUrls } });
        setPlaylist(ids);
        setCurrentIndex(0);
        setIsSubmitted(true);

        return validLinks;
      });
    });
  }, [isPending, inputs, checkEmbeddable, updateWindow, window.id]);

  const handleReset = () => {
    setIsSubmitted(false);
    setCurrentIndex(0);

    if (Array.isArray(window.url) && window.url.length > 0) {
      setInputs(
        window.url.map((url) => ({
          value: url,
          isEmbeddable: true,
          isLoading: false,
        }))
      );
    } else {
      setInputs([{ value: "", isEmbeddable: null, isLoading: false }]);
    }
  };

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
          {inputs.map((input, idx) => (
            <div
              key={idx}
              className="w-full flex items-center gap-2 mb-2 p-2 border rounded"
            >
              <input
                type="text"
                value={input.value}
                onChange={(e) => handleInputChange(idx, e.target.value)}
                onBlur={() => checkEmbeddable(idx)}
                placeholder="https://youtu.be/... 또는 https://www.youtube.com/watch?v=..."
                className="flex-1 border-none outline-none bg-transparent"
              />
              {input.isLoading && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
              )}
              {input.isEmbeddable === false && (
                <div title="유효하지 않거나 임베드가 금지된 영상입니다.">
                  <MdErrorOutline size={20} className="text-red-500" />
                </div>
              )}
              <button
                onClick={() => handleRemoveInput(idx)}
                aria-label="delete"
                className="flex-shrink-0"
              >
                <MdDeleteForever size={20} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-auto">
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
        <p>재생할 영상이 없습니다.</p>
        <button onClick={handleReset} aria-label="Reset playlist">
          <RiResetLeftLine size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <YouTube
        videoId={videoId}
        opts={{
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1 },
        }}
        onReady={onPlayerReady}
        onEnd={onPlayerEnd}
        className="w-full h-full"
        iframeClassName="w-full h-full"
      />
      <button
        onClick={handleReset}
        className="absolute top-1 left-1 p-1 bg-red-500 bg-opacity-50 text-white rounded-full hover:bg-opacity-75 transition-opacity"
        aria-label="Reset playlist"
      >
        <RiResetLeftLine size={16} />
      </button>
    </div>
  );
};

export default YouTubePlayer;
