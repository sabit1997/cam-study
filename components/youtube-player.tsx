"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FiAlertCircle, FiSkipBack, FiSkipForward, FiX, FiPlus, FiChevronDown } from "react-icons/fi";
import { IoLogoYoutube } from "react-icons/io5";
import { toast } from "sonner";
import YouTube, { YouTubeEvent } from "react-youtube";
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
  const [showInput, setShowInput] = useState(false);

  // Restore from server on mount
  useEffect(() => {
    if (!window.url || window.url.length === 0) return;
    const loaded = window.url
      .map((url, i) => {
        const id = extractYouTubeId(url);
        return id ? { id, title: window.urlTitles?.[i] || id } : null;
      })
      .filter((v): v is YtVideo => v !== null);
    setVideos(loaded);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const syncToServer = useCallback(
    (list: YtVideo[]) => {
      const urls = list.map((v) => `https://www.youtube.com/watch?v=${v.id}`);
      const urlTitles = list.map((v) => v.title);
      updateWindow({ id: window.id, data: { url: urls, urlTitles } });
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

  // 영상 종료 시 다음 영상으로 이동. 마지막 영상이면 첫 번째로 순환.
  // 영상이 1개뿐이면 처음으로 되감아 다시 재생한다.
  // react-youtube의 인스턴스별 onEnd 콜백을 사용하므로
  // 여러 YouTube 창이 열려있어도 다른 창에 영향을 주지 않는다.
  const videosRef = useRef(videos);
  useEffect(() => { videosRef.current = videos; }, [videos]);

  const handleVideoEnd = useCallback((event: YouTubeEvent<number>) => {
    const len = videosRef.current.length;
    if (len === 0) return;
    if (len === 1) {
      event.target.seekTo(0, true);
      event.target.playVideo();
      return;
    }
    setCurrent((prev) => (prev + 1) % len);
  }, []);

  const cur = videos[Math.min(current, videos.length - 1)];

  return (
    <div className="relative h-full bg-black">
      {/* Player: 전체 영역 차지 — 컨트롤 오버레이 덕분에 iframe이 16:9 컨테이너를 온전히 사용 */}
      <div className="absolute inset-0">
        {cur ? (
          <YouTube
            key={cur.id}
            videoId={cur.id}
            className="w-full h-full"
            iframeClassName="w-full h-full"
            opts={{
              width: "100%",
              height: "100%",
              playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
            }}
            onEnd={handleVideoEnd}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
            <IoLogoYoutube size={36} className="opacity-20 mb-2" />
            <p className="text-xs opacity-40">아래에 유튜브 URL을 추가하세요</p>
          </div>
        )}
      </div>

      {/* 오버레이 컨트롤 — URL 패널 열릴 때는 항상 표시, 닫혀있을 때는 hover 시 표시 */}
      <div
        className={`absolute bottom-0 left-0 right-0 pt-4
                    bg-gradient-to-t from-black/80 to-black/50
                    transition-opacity duration-200
                    ${showInput ? "opacity-100" : "opacity-0 hover:opacity-100"}`}
      >
        {/* 네비게이션 + 추가 버튼 */}
        <div className="flex items-center justify-between px-3 py-1.5">
          <button
            onClick={() => setCurrent((p) => (p - 1 + videos.length) % videos.length)}
            disabled={videos.length <= 1}
            className="p-1 text-white/60 hover:text-white disabled:opacity-25 transition-colors"
          >
            <FiSkipBack size={14} />
          </button>

          <div className="flex items-center gap-2">
            {videos.length > 0 && (
              <span className="text-xs text-white/60 font-medium tabular-nums">
                {current + 1} / {videos.length}
              </span>
            )}
            <button
              onClick={() => { setShowInput((v) => !v); setError(""); }}
              className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
              title="영상 추가"
            >
              {showInput ? <FiChevronDown size={13} /> : <FiPlus size={13} />}
            </button>
          </div>

          <button
            onClick={() => setCurrent((p) => (p + 1) % videos.length)}
            disabled={videos.length <= 1}
            className="p-1 text-white/60 hover:text-white disabled:opacity-25 transition-colors"
          >
            <FiSkipForward size={14} />
          </button>
        </div>

        {/* URL 입력 패널 (접기/펼치기) */}
        {showInput && (
          <div className="px-3 pb-2.5 border-t border-white/20">
            {error && (
              <p className="text-[11px] text-red-400 mt-1.5 mb-1 flex items-center gap-1">
                <FiAlertCircle size={10} />
                {error}
              </p>
            )}
            <div className="flex gap-1.5 mt-2">
              <input
                autoFocus
                value={inputUrl}
                onChange={(e) => { setInputUrl(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && addVideo()}
                placeholder="유튜브 URL을 붙여넣으세요..."
                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-white/20 outline-none focus:border-lime-400 bg-white/10 text-white placeholder:text-white/40 transition-colors"
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
              <div className="mt-2 flex flex-wrap gap-1 max-h-14 overflow-y-auto">
                {videos.map((v, i) => (
                  <div
                    key={v.id}
                    className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                      i === current
                        ? "bg-lime-100/80 text-lime-700"
                        : "bg-white/10 text-white/60 hover:bg-white/20"
                    }`}
                    onClick={() => setCurrent(i)}
                  >
                    <span className="max-w-[120px] truncate">{v.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeVideo(i);
                      }}
                      className="hover:text-red-400 ml-0.5 flex-shrink-0"
                    >
                      <FiX size={9} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default YouTubePlayer;
