"use client";

import { useWindowStore } from "@/stores/window-state";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { MypageButton } from "./mypage-button";
import { IoLogOutOutline, IoLibrary, IoTime } from "react-icons/io5";
import { IoMdSettings } from "react-icons/io";

import { useEffect, useState } from "react";
import Link from "next/link";

export const MyPageSidebar = () => {
  const setWindows = useWindowStore((state) => state.setWindows);
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const hasToken = document.cookie.includes("AccessToken=");
    setIsLoggedIn(hasToken);
  }, []);

  const handleSignOut = () => {
    document.cookie = "AccessToken=; path=/; max-age=0";
    localStorage.clear();
    queryClient.clear();
    setWindows([]);
    setIsLoggedIn(false);
    router.push("/sign-in");
  };

  const isActive = (path: string) =>
    pathname === path
      ? "bg-dark text-[var(--text-selected)]"
      : "bg-primary text-dark";

  return (
    <div className="flex justify-center gap-2 pt-8 w-full">
      {isLoggedIn && (
        <>
          <Link
            className={`${isActive("/my-page/record")} mypage-button`}
            href="/my-page/record"
          >
            <IoTime />
            시간 기록
          </Link>
          <Link
            className={`${isActive("/my-page/statistics")} mypage-button`}
            href="/my-page/statistics"
          >
            <IoLibrary />
            시간 통계
          </Link>
          <Link
            href="/my-page/theme-setting"
            className={`${isActive("/my-page/theme-setting")} mypage-button`}
          >
            <IoMdSettings />
            테마 색상 설정
          </Link>
          <MypageButton
            onClick={handleSignOut}
            className="active:bg-dark active:text-[var(--text-selected)] bg-primary"
          >
            <IoLogOutOutline />
            Sign Out
          </MypageButton>
        </>
      )}
    </div>
  );
};
