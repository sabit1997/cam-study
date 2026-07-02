"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IoLogoYoutube,
  IoCameraOutline,
  IoDesktopOutline,
  IoCheckboxOutline,
  IoTimerOutline,
  IoBarChartOutline,
} from "react-icons/io5";
import { useCreateWindow } from "@/apis/services/window-services/mutation";
import { useWindowStore } from "@/stores/window-state";
import { toast } from "sonner";
import { TypeList } from "@/types/dto";

const CASCADE_MAX = 12;
const STEP_X = 48;
const STEP_Y = 28;
const BASE_X = 100;
const BASE_Y = 100;

interface DockItem {
  type: TypeList;
  label: string;
  color: string;
  icon: React.ReactNode;
  width: number;
  height: number;
}

const DOCK_ITEMS: DockItem[] = [
  {
    type: "youtube",
    label: "YouTube",
    color: "#e88090",
    icon: <IoLogoYoutube size={22} />,
    width: 580,   // ~16:9 player area + bottom UI
    height: 440,
  },
  {
    type: "camera",
    // 16:9 video area (480×270) + control bar (~46px) → 480×316 ≈ 480×320
    // lockAspectRatio will keep this 3:2 ratio on resize
    label: "Camera",
    color: "#8fb870",
    icon: <IoCameraOutline size={22} />,
    width: 480,
    height: 320,
  },
  {
    type: "window",
    // 16:9 video area (580×326) + control bar (~46px) → 580×372 ≈ 580×375
    label: "Screen",
    color: "#80b8d8",
    icon: <IoDesktopOutline size={22} />,
    width: 580,
    height: 375,
  },
  {
    type: "todo",
    label: "To-Do",
    color: "#e8c070",
    icon: <IoCheckboxOutline size={22} />,
    width: 360,
    height: 480,
  },
  {
    type: "timer",
    label: "Timer",
    color: "#c0b8e8",
    icon: <IoTimerOutline size={22} />,
    width: 320,
    height: 380,
  },
];

export default function WindowDock() {
  const { mutate: createWindow, isPending } = useCreateWindow();
  const windows = useWindowStore((state) => state.windows);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleCreate = (item: DockItem) => {
    const maxZIndex =
      windows.length > 0 ? Math.max(...windows.map((w) => w.zIndex)) : 0;
    const step = windows.length % CASCADE_MAX;

    createWindow(
      {
        type: item.type,
        zIndex: maxZIndex + 1,
        x: BASE_X + step * STEP_X,
        y: BASE_Y + step * STEP_Y,
        width: item.width,
        height: item.height,
      },
      {
        onError: () => {
          toast.error("창 추가에 실패했습니다.");
        },
      }
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(255,255,255,0.6)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.9)",
        borderRadius: 24,
        boxShadow: "0 2px 6px rgba(0,0,0,0.06), 0 10px 28px rgba(0,0,0,0.08)",
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        gap: 4,
        zIndex: 1000,
      }}
    >
      {DOCK_ITEMS.map((item, index) => (
        <div key={item.type} style={{ position: "relative" }}>
          {/* Tooltip */}
          {hoveredIndex === index && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(55,65,81,0.9)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 6,
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {item.label}
            </div>
          )}
          <button
            type="button"
            onClick={() => handleCreate(item)}
            disabled={isPending}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `${item.color}18`,
              color: item.color,
              border: "none",
              cursor: isPending ? "not-allowed" : "pointer",
              transition: "transform 0.15s ease, background 0.15s ease",
              transform: hoveredIndex === index ? "scale(1.12)" : "scale(1)",
            }}
            onMouseDown={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.94)";
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform =
                hoveredIndex === index ? "scale(1.12)" : "scale(1)";
            }}
          >
            {item.icon}
          </button>
        </div>
      ))}

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: 32,
          background: "rgba(0,0,0,0.1)",
          margin: "0 4px",
          flexShrink: 0,
        }}
      />

      {/* Stats link */}
      <div style={{ position: "relative" }}>
        {hoveredIndex === DOCK_ITEMS.length && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(55,65,81,0.9)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 500,
              padding: "3px 8px",
              borderRadius: 6,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            내 통계
          </div>
        )}
        <Link
          href="/my-page/record"
          onMouseEnter={() => setHoveredIndex(DOCK_ITEMS.length)}
          onMouseLeave={() => setHoveredIndex(null)}
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${"#c0b8e8"}18`,
            color: "#c0b8e8",
            textDecoration: "none",
            transition: "transform 0.15s ease",
            transform: hoveredIndex === DOCK_ITEMS.length ? "scale(1.12)" : "scale(1)",
          }}
        >
          <IoBarChartOutline size={22} />
        </Link>
      </div>
    </div>
  );
}
