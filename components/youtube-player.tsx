"use client";

import { useState, useEffect, useCallback } from "react";
import { FiAlertCircle, FiSkipBack, FiSkipForward, FiX } from "react-icons/fi";
import { IoLogoYoutube } from "react-icons/io5";
import { toast } from "sonner";
import { Window } from "@/types/windows";
import { usePatchWindow } from "@/apis/services/window-services/mutation";
import { extractYouTubeId } from "@/utils/extractYouTubeId";

interface YouTubePlayerProps {
  window: Window;
}

interface YtVideo {
  id: string;
  title: string;
}

const YouTubePlayer = ({ window }: YouTubePlayerProps) => {
  const { mutate: updateWindow } = usePatchWindow();
  const [videos, setVideos] = useState<YtVideo[]>([]);
  const [current, setCurrent] = useState(0);
  const [inputUrl, setInputUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  // Restore from server on mount
  useEffect(() => {
    if (window.url && window.url.length > 0) {
      const loaded = window.url
        .map((url) => {
          const id = extractYouTubeId(url);
          return id ? { id, title: `Video` } : null;
        })
        .filter((v): v is YtVideo => v !== null);
      setVideos(loaded);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const syncToServer = useCallback(
    (list: YtVideo[]) => {
      const urls = list.map((v) => `https://www.youtube.com/watch?v=${v.id}`);
      updateWindow({ id: window.id, data: { url: urls } });
    },
    [updateWindow, window.id]
  );

  const addVideo = async () => {
    const url = inputUrl.trim();
    if (!url) return;
    setChecking(true);
    setError("");

    const id = extractYouTubeId(url);
    if (!id) {
      setError("올바른 유튜브 URL이 아닙니다");
      setChecking(false);
      return;
    }

    if (videos.some((v) => v.id === id)) {
      setError("이미 추가된 영상입니다");
      setChecking(false);
      return;
    }

    try {
      const res = await fetch("/api/check-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data.isEmbeddable) {
        setError("이 영상은 임베드가 불가합니다");
        setChecking(false);
        return;
      }
      const newVideo: YtVideo = { id, title: data.title || `Video ${videos.length + 1}` };
      const next = [...videos, newVideo];
      setVideos(next);
      syncToServer(next);
      setInputUrl("");
    } catch {
      toast.error("영상 확인에 실패했습니다.");
    } finally {
      setChecking(false);
    }
  };

  const removeVideo = (idx: number) => {
    const next = videos.filter((_, i) => i !== idx);
    setVideos(next);
    syncToServer(next);
    setCurrent((prev) => Math.min(prev, Math.max(0, next.length - 1)));
  };

  const cur = videos[Math.min(current, videos.length - 1)];

  return (
    <div className="flex flex-col h-full">
      {/* Player */}
      <div className="flex-1 bg-black relative overflow-hidden">
        {cur ? (
          <iframe
            key={cur.id}
            src={`https://www.youtube.com/embed/${cur.id}?rel=0&modestbranding=1&autoplay=1`}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
            <IoLogoYoutube size={36} className="opacity-20 mb-2" />
            <p className="text-xs opacity-40">아래에 유튜브 URL을 추가하세요</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      {videos.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={() => setCurrent((p) => Math.max(0, p - 1))}
            disabled={current === 0}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25 transition-colors"
          >
            <FiSkipBack size={14} />
          </button>
          <span className="text-xs text-gray-400 font-medium">
            {Math.min(current + 1, videos.length)} / {videos.length}
          </span>
          <button
            onClick={() => setCurrent((p) => Math.min(videos.length - 1, p + 1))}
            disabled={current >= videos.length - 1}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25 transition-colors"
          >
            <FiSkipForward size={14} />
          </button>
        </div>
      )}

      {/* URL input + playlist */}
      <div className="px-3 py-2.5 border-t border-gray-100 flex-shrink-0">
        {error && (
          <p className="text-[11px] text-red-500 mb-1.5 flex items-center gap-1">
            <FiAlertCircle size={10} />
            {error}
          </p>
        )}
        <div className="flex gap-1.5">
          <input
            value={inputUrl}
            onChange={(e) => { setInputUrl(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && addVideo()}
            placeholder="유튜브 URL을 붙여넣으세요..."
            className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-lime-400 bg-gray-50 transition-colors"
          />
          <button
            onClick={addVideo}
            disabled={checking || !inputUrl.trim()}
            className="text-xs px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-50 transition-opacity"
            style={{ background: "linear-gradient(135deg, #e8c8f0, #c0b8e8)" }}
          >
            {checking ? "…" : "추가"}
          </button>
        </div>
        {videos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 max-h-16 overflow-y-auto">
            {videos.map((v, i) => (
              <div
                key={v.id}
                className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                  i === current
                    ? "bg-lime-100 text-lime-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                onClick={() => setCurrent(i)}
              >
                <span className="max-w-[120px] truncate">{v.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeVideo(i);
                  }}
                  className="hover:text-red-500 ml-0.5 flex-shrink-0"
                >
                  <FiX size={9} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default YouTubePlayer;
