"use client";

import Link from "next/link";
import { useUserStore } from "@/stores/user-state";
import { useWindowStore } from "@/stores/window-state";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@/apis/services/auth-services/mutation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IoBarChartOutline, IoLogOutOutline, IoMoonOutline, IoSunnyOutline } from "react-icons/io5";
import { useThemeStore } from "@/stores/theme-state";

const Navigation = () => {
  const user = useUserStore((state) => state.user);
  const logoutUser = useUserStore((state) => state.logout);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const toggleDarkMode = useThemeStore((state) => state.toggleDarkMode);
  const setWindows = useWindowStore((state) => state.setWindows);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { mutate: logoutMutate } = useLogout();

  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logoutMutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setWindows([]);
        logoutUser();
        router.push("/sign-in");
      },
      onError: () => {
        queryClient.clear();
        setWindows([]);
        logoutUser();
        router.push("/sign-in");
      },
    });
  };

  const isAuthenticated = mounted && !!user;

  return (
    <div
      style={{
        height: 36,
        background: isDarkMode ? "rgba(13,17,23,0.88)" : "rgba(255,255,255,0.8)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: isDarkMode ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)",
        position: "sticky",
        top: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 8,
      }}
    >
      {/* Left: Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            background: "linear-gradient(135deg, #e8c8f0, #c0b8e8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>C</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? "#e5e7eb" : "#374151", letterSpacing: "0.05em" }}>
          CAM STUDY
        </span>
      </div>

      {/* Center spacer */}
      <div style={{ flex: 1 }} />

      {/* Right: auth actions */}
      {isAuthenticated && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            href="/my-page/record"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: isDarkMode ? "#d1d5db" : "#374151",
              textDecoration: "none",
              padding: "2px 8px",
              borderRadius: 6,
              border: isDarkMode ? "1px solid rgba(143,184,112,0.25)" : "1px solid rgba(143,184,112,0.4)",
              background: isDarkMode ? "rgba(143,184,112,0.12)" : "rgba(143,184,112,0.08)",
            }}
          >
            <IoBarChartOutline style={{ fontSize: 13 }} />
            <span>내 통계</span>
          </Link>

          <span style={{ fontSize: 11, color: isDarkMode ? "#9ca3af" : "#6b7280", fontVariantNumeric: "tabular-nums" }}>
            {currentTime}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #a8c890, #6a9050)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>
                {user?.username?.charAt(0)?.toUpperCase() ?? "U"}
              </span>
            </div>
            <span style={{ fontSize: 12, color: isDarkMode ? "#e5e7eb" : "#374151", fontWeight: 500 }}>
              {user?.username}
            </span>
          </div>

          <button
            onClick={toggleDarkMode}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              borderRadius: 6,
              background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
              border: "none",
              cursor: "pointer",
              color: isDarkMode ? "#fcd34d" : "#6b7280",
              fontSize: 14,
              flexShrink: 0,
            }}
            type="button"
            title={isDarkMode ? "라이트 모드" : "다크 모드"}
          >
            {isDarkMode ? <IoSunnyOutline /> : <IoMoonOutline />}
          </button>

          <button
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontSize: 11,
              color: isDarkMode ? "#9ca3af" : "#6b7280",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 6px",
              borderRadius: 4,
            }}
            type="button"
          >
            <IoLogOutOutline style={{ fontSize: 14 }} />
            <span>로그아웃</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default Navigation;
