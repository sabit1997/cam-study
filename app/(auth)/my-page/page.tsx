"use client";

import NoAuthMyPage from "@/components/no-auth-mypage";
import RectangleButton from "@/components/rectangle-button";
import { useWindowStore } from "@/stores/window-state";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const MyPage = () => {
  const [logoutTrigger, setLogoutTrigger] = useState(false);
  const setWindows = useWindowStore((state) => state.setWindows);
  const queryClient = useQueryClient();

  const handleSignOut = () => {
    document.cookie = "AccessToken=; path=/; max-age=0";
    localStorage.clear();
    queryClient.clear();
    setWindows([]);
    setLogoutTrigger(true);
  };

  if (logoutTrigger) return <NoAuthMyPage />;
  return (
    <RectangleButton width="w-[200px]" onClick={handleSignOut}>
      Sign Out
    </RectangleButton>
  );
};

export default MyPage;
