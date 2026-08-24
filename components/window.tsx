
import { FiLock, FiUnlock, FiCheck, FiEdit2 } from "react-icons/fi";

import { Rnd } from "react-rnd";
import { Window } from "@/types/windows";
import {
  useDeleteWindow,
  usePatchWindow,
} from "@/apis/services/window-services/mutation";
import { useDebouncedCallback } from "use-debounce";
import { useWindowStore } from "@/stores/window-state";
import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  lazy,
  Suspense,
} from "react";
import TooltipWrapper from "./tooltip-wrapper";
import { useThemeStore } from "@/stores/theme-state";
import useViewportSize from "@/hooks/useViewportSize";
import { TypeList, WindowPatchDto } from "@/types/dto";
import { clampWindowPosition, getPositionScale } from "@/utils/workspace";

// 창 타입별 컴포넌트를 lazy load — 초기 번들에 포함되지 않고 첫 사용 시 로드
const CameraView = lazy(() => import("./camera-view"));
const YouTubePlayer = lazy(() => import("./youtube-player"));
const WindowShare = lazy(() => import("./window-share"));
const Todos = lazy(() => import("./todos"));
const Timer = lazy(() => import("./timer"));

interface AddWindowProps {
  window: Window;
}

const TITLEBAR_H = 38;

// Type-specific minimum sizes in pixels (generous enough to show all UI)
const MIN_PX: Record<TypeList, { w: number; h: number }> = {
  none: { w: 240, h: 135 },
  camera: { w: 280, h: 180 }, // control bar ~46px + some video
  window: { w: 280, h: 180 },
  youtube: { w: 320, h: 260 }, // player + nav + url input
  todo: { w: 260, h: 240 }, // header + tabs + items + input
  timer: { w: 240, h: 350 }, // pomodoro ring 144px + tabs + controls
};

const TYPE_LABELS: Record<TypeList, string> = {
  none: "WINDOW",
  camera: "CAMERA",
  youtube: "YOUTUBE",
  window: "SCREEN",
  todo: "TO-DO",
  timer: "TIMER",
};

const WIN_TITLE_LS_KEY = "win-titles";

function getWinTitles(): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem(WIN_TITLE_LS_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function saveWinTitle(id: number, title: string) {
  const map = getWinTitles();
  map[id] = title;
  localStorage.setItem(WIN_TITLE_LS_KEY, JSON.stringify(map));
}
function clearWinTitle(id: number) {
  const map = getWinTitles();
  delete map[id];
  localStorage.setItem(WIN_TITLE_LS_KEY, JSON.stringify(map));
}

const iframePointerEvents = new WeakMap<HTMLIFrameElement, string>();

function setIframesPointerEvents(value: "none" | "auto") {
  document.querySelectorAll("iframe").forEach((f) => {
    if (value === "none") {
      if (!iframePointerEvents.has(f)) {
        iframePointerEvents.set(f, f.style.pointerEvents);
      }
      f.style.pointerEvents = "none";
    } else {
      f.style.pointerEvents = iframePointerEvents.get(f) ?? "";
      iframePointerEvents.delete(f);
    }
  });
}

const AddWindow = ({ window }: AddWindowProps) => {
  const [isLocked, setIsLocked] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const prevHeightRef = useRef<number | null>(null);
  // youtube는 항상 16/9, camera/window(화면공유)는 스트림 감지 후 설정
  const [contentRatio, setContentRatio] = useState<number | null>(
    window.type === "youtube" ? 16 / 9 : null
  );
  const [titleVal, setTitleVal] = useState(() => {
    if (typeof localStorage === "undefined")
      return TYPE_LABELS[window.type] ?? "WINDOW";
    const saved = getWinTitles();
    return saved[window.id] ?? TYPE_LABELS[window.type] ?? "WINDOW";
  });

  const { mutateAsync: updateWindow } = usePatchWindow();
  const { mutate: deleteWindow, isPending: isDeletePending } =
    useDeleteWindow();

  // Granular subscriptions — other windows' zIndex changes don't re-render this component
  const bringToFront = useWindowStore((s) => s.bringToFront);
  const updateWindowBounds = useWindowStore((s) => s.updateWindowBounds);
  const removeWindow = useWindowStore((s) => s.removeWindow);
  const markWindowPending = useWindowStore((s) => s.markWindowPending);
  const clearWindowPending = useWindowStore((s) => s.clearWindowPending);
  const currentZIndex = useWindowStore(
    (s) => s.windows.find((w) => w.id === window.id)?.zIndex ?? window.zIndex
  );

  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const { vw, vh } = useViewportSize();
  const { id, type, x, y, width, height } = window;
  const scale = getPositionScale(vw, vh);
  const pxX = x * scale;
  const pxY = y * scale;
  const pxW = Math.max(width * scale, MIN_PX[type]?.w ?? 240);
  const pxH = Math.max(height * scale, MIN_PX[type]?.h ?? 135);

  // Local controlled state for Rnd — completely decoupled from Zustand during interaction
  const [pos, setPos] = useState(() =>
    clampWindowPosition(pxX, pxY, pxW, pxH, vw, vh)
  );
  const [sz, setSz] = useState({ w: pxW, h: pxH });

  // Prevent useEffect from overriding pos/sz during active drag or resize
  const dragging = useRef(false);
  const resizing = useRef(false);
  const updateQueue = useRef(Promise.resolve());

  const queueWindowUpdate = useCallback(
    (data: WindowPatchDto, generation: number) => {
      updateQueue.current = updateQueue.current
        .then(() => updateWindow({ id, data, generation }))
        .then(() => undefined)
        .catch(() => undefined);
    },
    [id, updateWindow]
  );

  // 스트림 비율 감지 시 창 자동 리사이즈 (화면공유·카메라)
  // 매 렌더마다 최신 sz를 ref에 기록해 effect 내 stale closure 방지
  const szRef = useRef(sz);
  szRef.current = sz;
  const autoResizedForRatio = useRef<number | null>(null);
  useEffect(() => {
    if (contentRatio === null) return;
    // youtube는 서버 저장값을 그대로 사용 (마운트 시 자동 리사이�� 불필요)
    if (type !== "window" && type !== "camera") return;
    // 같은 비율로 이미 리사이즈한 경우 재실행 방지
    if (autoResizedForRatio.current === contentRatio) return;
    autoResizedForRatio.current = contentRatio;

    const w = szRef.current.w;
    const correctH = Math.round(w / contentRatio) + TITLEBAR_H;
    if (Math.abs(correctH - szRef.current.h) < 4) return; // 이미 거의 맞으면 생략
    const clamped = clampWindowPosition(pos.x, pos.y, w, correctH, vw, vh);
    setPos(clamped);
    setSz({ w, h: correctH });
    const rx = Math.round(clamped.x / scale);
    const ry = Math.round(clamped.y / scale);
    const rw = Math.round(w / scale);
    const rh = Math.round(correctH / scale);
    updateWindowBounds(id, rx, ry, rw, rh);
    debouncedServerUpdate(
      rx,
      ry,
      rw,
      rh,
      markWindowPending(id)
    );
  }, [contentRatio]); // eslint-disable-line react-hooks/exhaustive-deps -- rnd 인스턴스 ref는 React 관리 밖이므로 제외 안전

  // Sync from the store/viewport only when not interacting.
  useEffect(() => {
    if (dragging.current || resizing.current) return;
    const clamped = clampWindowPosition(pxX, pxY, pxW, pxH, vw, vh);
    // window prop 이 글로벌 window 를 shadow 하므로 globalThis 사용
    globalThis.__perf?.count("window.setPos");
    setPos(clamped);
    setSz({ w: pxW, h: pxH });
  }, [pxX, pxY, pxW, pxH, vw, vh]);

  useEffect(() => {
    const saved = getWinTitles();
    if (!saved[id]) setTitleVal(TYPE_LABELS[type] ?? "WINDOW");
  }, [type, id]);

  const handleClose = useCallback(() => {
    if (isDeletePending) return;
    clearWinTitle(id);
    // 즉시 UI에서 제거해 클릭 반응성 확보. 서버 DELETE는 백그라운드로 처리하고
    // 실패 시 mutation의 onError → invalidate로 refetch되어 자동 복원된다.
    removeWindow(id);
    deleteWindow(id);
  }, [isDeletePending, deleteWindow, removeWindow, id]);

  const handleMinimize = useCallback(() => {
    setIsMinimized((prev) => {
      if (!prev) {
        prevHeightRef.current = sz.h;
        setSz((s) => ({ ...s, h: TITLEBAR_H }));
      } else {
        setSz((s) => ({ ...s, h: prevHeightRef.current ?? pxH }));
      }
      return !prev;
    });
  }, [sz.h, pxH]);

  const debouncedServerUpdate = useDebouncedCallback(
    (rx: number, ry: number, rw: number, rh: number, generation: number) => {
      queueWindowUpdate({ x: rx, y: ry, width: rw, height: rh }, generation);
    },
    500
  );

  const debouncedZIndexUpdate = useDebouncedCallback((generation: number) => {
    queueWindowUpdate({ zIndex: currentZIndex }, generation);
  }, 300);

  useEffect(() => {
    const restoreIframeInteraction = () => {
      dragging.current = false;
      resizing.current = false;
      setIframesPointerEvents("auto");
    };
    globalThis.window.addEventListener("blur", restoreIframeInteraction);
    return () => {
      globalThis.window.removeEventListener("blur", restoreIframeInteraction);
      debouncedServerUpdate.cancel();
      debouncedZIndexUpdate.cancel();
      restoreIframeInteraction();
      clearWindowPending(id);
    };
  }, [
    clearWindowPending,
    debouncedServerUpdate,
    debouncedZIndexUpdate,
    id,
  ]);

  // Focus: called ONLY from inner div onMouseDown.
  // Must NOT be called from onDragStart — calling it there triggers a Zustand update
  // mid-drag-setup which causes react-draggable to lose the drag.
  const handleFocus = useCallback(() => {
    bringToFront(id);
    debouncedZIndexUpdate(markWindowPending(id));
  }, [bringToFront, id, markWindowPending, debouncedZIndexUpdate]);

  const commitTitle = useCallback(() => {
    const trimmed = titleVal.trim() || TYPE_LABELS[type] || "WINDOW";
    setTitleVal(trimmed);
    saveWinTitle(id, trimmed);
    setEditTitle(false);
  }, [titleVal, id, type]);

  const minW = MIN_PX[type]?.w ?? 240;
  // 비율 고정 모드: minH를 minW 기준으로 자동 계산
  const minH =
    contentRatio !== null
      ? Math.round(minW / contentRatio) + TITLEBAR_H
      : (MIN_PX[type]?.h ?? 135);

  // lockAspectRatioExtraHeight를 TITLEBAR_H로 설정하면
  // re-resizable이 타이틀바를 자동 보정해 콘텐츠 영역이 정확히 contentRatio 비율로 유지됨
  const aspectProps =
    contentRatio !== null && !isMinimized
      ? {
          lockAspectRatio: contentRatio,
          lockAspectRatioExtraHeight: TITLEBAR_H,
          lockAspectRatioExtraWidth: 0,
        }
      : { lockAspectRatio: false as const };

  const windowContent: Partial<Record<Window["type"], React.ReactNode>> = {
    camera: (
      <CameraView
        windowId={window.id}
        onAspectRatioDetected={setContentRatio}
      />
    ),
    youtube: <YouTubePlayer window={window} />,
    window: (
      <WindowShare
        windowId={window.id}
        onAspectRatioDetected={setContentRatio}
      />
    ),
    todo: <Todos window={window} />,
    timer: <Timer />,
  };

  return (
    <Rnd
      position={{ x: pos.x, y: pos.y }}
      size={{ width: sz.w, height: sz.h }}
      minWidth={minW}
      minHeight={isMinimized ? TITLEBAR_H : minH}
      bounds="parent"
      {...aspectProps}
      disableDragging={isLocked}
      enableResizing={
        isLocked || isMinimized
          ? false
          : {
              top: true,
              right: true,
              bottom: true,
              left: true,
              topRight: true,
              bottomRight: true,
              bottomLeft: true,
              topLeft: true,
            }
      }
      style={{
        zIndex: currentZIndex,
        position: "absolute",
        pointerEvents: "auto",
        willChange: "transform",
      }}
      dragHandleClassName="drag-handle"
      // ── Drag ──────────────────────────────────────────────────────────────
      // DO NOT call handleFocus here — that triggers a Zustand update which
      // causes a re-render that interrupts react-draggable's drag initiation.
      onDragStart={() => {
        dragging.current = true;
        // 드래그 중 마우스가 <iframe>(YouTube 등)에 진입하면 mouseup이 iframe
        // 내부에서 소진돼 react-draggable의 document 리스너가 못 잡고 드래그가
        // 영원히 stuck 됨. iframe pointer-events를 잠깐 끄면 마우스가 iframe을
        // 통과해 부모 document로 이벤트가 전달된다. onDragStop에서 복원.
        setIframesPointerEvents("none");
      }}
      // DO NOT update pos in onDrag — in react-rnd controlled mode, during active
      // drag react-draggable uses its internal state for rendering (ignores position
      // prop), so updating pos here just causes wasted re-renders with no effect.
      onDragStop={(_e, d) => {
        dragging.current = false;
        setIframesPointerEvents("auto");
        const clamped = clampWindowPosition(d.x, d.y, sz.w, sz.h, vw, vh);
        // Update local state — React 18 batches this with react-draggable's own
        // setState({dragging:false}), so position prop is correct in the same render
        // that exits drag mode → no snapback.
        setPos(clamped);
        const rx = Math.round(clamped.x / scale);
        const ry = Math.round(clamped.y / scale);
        const rw = Math.round(sz.w / scale);
        const rh = Math.round(sz.h / scale);
        updateWindowBounds(id, rx, ry, rw, rh);
        debouncedServerUpdate(rx, ry, rw, rh, markWindowPending(id));
      }}
      // ── Resize ────────────────────────────────────────────────────────────
      onResizeStart={() => {
        resizing.current = true;
        setIframesPointerEvents("none");
      }}
      onResizeStop={(_e, dir, ref, _delta, position) => {
        resizing.current = false;
        setIframesPointerEvents("auto");
        let newW = ref.offsetWidth;
        let newH = ref.offsetHeight;
        // floating-point 오차 보정 — lockAspectRatioExtraHeight 공식이 정수로 딱 떨어지지 않을 수 있음
        if (contentRatio !== null) {
          if (dir === "top" || dir === "bottom") {
            // 세로 드래그 → height 기준으로 width 재계산
            newW = Math.round((newH - TITLEBAR_H) * contentRatio);
          } else {
            // 가로/코너 드래그 → width 기준으로 height 재계산
            newH = Math.round(newW / contentRatio) + TITLEBAR_H;
          }
        }
        const clamped = clampWindowPosition(
          position.x,
          position.y,
          newW,
          newH,
          vw,
          vh
        );
        setPos(clamped);
        setSz({ w: newW, h: newH });
        const rx = Math.round(clamped.x / scale);
        const ry = Math.round(clamped.y / scale);
        const rw = Math.round(newW / scale);
        const rh = Math.round(newH / scale);
        updateWindowBounds(id, rx, ry, rw, rh);
        debouncedServerUpdate(rx, ry, rw, rh, markWindowPending(id));
      }}
    >
      {/* Inner div: onMouseDown here (not on Rnd) so focus fires BEFORE react-draggable
          captures the event. This lets the bringToFront re-render settle before drag starts. */}
      <div
        data-window-id={id}
        className="w-full h-full flex flex-col overflow-hidden"
        onMouseDown={handleFocus}
        style={{
          borderRadius: 13,
          border: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.85)",
          boxShadow:
            "0 2px 4px rgba(0,0,0,0.04), 0 8px 20px rgba(0,0,0,0.1), 0 20px 50px rgba(0,0,0,0.08)",
        }}
      >
        {/* Titlebar */}
        <div
          className="drag-handle flex items-center px-3 flex-shrink-0 select-none"
          style={{
            height: 38,
            background: isDarkMode
              ? "linear-gradient(180deg, #1e2030 0%, #1a1c2a 100%)"
              : "linear-gradient(180deg, #fafafa 0%, #f4f4f6 100%)",
            borderBottom: isDarkMode ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)",
            cursor: isLocked ? "default" : "grab",
            borderRadius: "13px 13px 0 0",
          }}
        >
          {/* Traffic lights */}
          <div
            className="flex items-center gap-1.5"
            onMouseDown={(e) => {
              handleFocus();
              e.stopPropagation();
            }}
          >
            <TooltipWrapper content="닫기">
              <button
                className="flex items-center justify-center w-5 h-5 rounded-full transition-opacity hover:opacity-80 active:opacity-60"
                onClick={handleClose}
              >
                <span className="w-3 h-3 rounded-full bg-[#ff5f57] block" />
              </button>
            </TooltipWrapper>
            <TooltipWrapper content={isMinimized ? "복원" : "최소화"}>
              <button
                className="flex items-center justify-center w-5 h-5 rounded-full transition-opacity hover:opacity-80 active:opacity-60"
                onClick={handleMinimize}
              >
                <span className="w-3 h-3 rounded-full bg-[#ffbd2e] block" />
              </button>
            </TooltipWrapper>
          </div>

          {/* Center title */}
          <div className="flex-1 flex items-center justify-center">
            {editTitle ? (
              <div
                className="flex items-center gap-1"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  value={titleVal}
                  onChange={(e) => setTitleVal(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditTitle(false);
                  }}
                  className="text-[11px] font-semibold tracking-widest text-center bg-white dark:bg-gray-800 dark:text-gray-200 border border-lime-400 rounded-md px-2 py-0.5 outline-none w-28"
                />
                <button
                  onClick={commitTitle}
                  className="text-green-500 hover:text-green-600"
                >
                  <FiCheck size={11} />
                </button>
              </div>
            ) : (
              <span
                className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors cursor-text"
                style={{ letterSpacing: "0.12em" }}
                onDoubleClick={() => setEditTitle(true)}
                title="더블클릭으로 이름 변경"
              >
                {titleVal}
              </span>
            )}
          </div>

          {/* Right: Edit + Lock */}
          <div
            className="flex items-center gap-1.5"
            onMouseDown={(e) => {
              handleFocus();
              e.stopPropagation();
            }}
          >
            <button
              className="flex items-center justify-center w-6 h-6 rounded text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => setEditTitle(true)}
            >
              <FiEdit2 size={11} />
            </button>
            <TooltipWrapper content={isLocked ? "잠금 해제" : "잠금"}>
              <button
                onClick={() => setIsLocked((prev) => !prev)}
                className="flex items-center justify-center w-6 h-6 rounded text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {isLocked ? (
                  <FiLock size={11} className="text-lime-500" />
                ) : (
                  <FiUnlock size={11} />
                )}
              </button>
            </TooltipWrapper>
          </div>
        </div>

        {/* Content — 최소화 시 숨김 */}
        <div
          className="flex-1 relative overflow-hidden bg-white dark:bg-[#161822]"
          style={{ display: isMinimized ? "none" : undefined }}
        >
          <Suspense fallback={<div className="w-full h-full bg-white dark:bg-[#161822]" />}>
            {windowContent[type] ?? null}
          </Suspense>
          {!isLocked && (
            <div className="absolute bottom-0 right-0 w-5 h-5 pointer-events-none z-10">
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                className="absolute bottom-1.5 right-1.5 text-gray-300 dark:text-gray-700"
              >
                <path
                  d="M9 1L1 9M5.5 1L1 5.5M9 4.5L4.5 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}
        </div>
      </div>
    </Rnd>
  );
};

export default React.memo(AddWindow);
