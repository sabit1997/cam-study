"use client";

import { useWindowStore } from "@/stores/window-state";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { MypageButton } from "./mypage-button";
import { IoLogOutOutline } from "react-icons/io5";
import { IoLibrary } from "react-icons/io5";
import { IoTime } from "react-icons/io5";

export const MyPageSidebar = () => {
  const setWindows = useWindowStore((state) => state.setWindows);
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  const isActive = (path: string) =>
    pathname === path
      ? "bg-[#255f38] text-white"
      : "bg-[#a0c878] text-[#255f38]";

  const handleSignOut = () => {
    document.cookie = "AccessToken=; path=/; max-age=0";
    localStorage.clear();
    queryClient.clear();
    setWindows([]);
  };

  return (
    <div className="flex justfiy-center gap-2 sticky top-0 left-0 pt-8">
      <MypageButton
        className={`${isActive("/my-page/record")}`}
        onClick={() => router.push("/my-page/record")}
      >
        <IoTime />
        시간 기록
      </MypageButton>
      <MypageButton
        className={`${isActive("/my-page/statistics")}`}
        onClick={() => router.push("/my-page/statistics")}
      >
        <IoLibrary />
        시간 통계
      </MypageButton>
      <MypageButton onClick={handleSignOut} className="bg-[#255f38] text-white">
        <IoLogOutOutline />
        Sign Out
      </MypageButton>
    </div>
  );
};
