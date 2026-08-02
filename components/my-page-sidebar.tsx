import { useWindowStore } from "@/stores/window-state";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { MypageButton } from "./mypage-button";
import { IoLogOutOutline, IoLibrary, IoTime } from "react-icons/io5";
import { IoMdSettings } from "react-icons/io";
import { useLogout } from "@/apis/services/auth-services/mutation";
import { useUserStore } from "@/stores/user-state";

export const MyPageSidebar = () => {
  const setWindows = useWindowStore((state) => state.setWindows);
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const logoutUser = useUserStore((state) => state.logout);

  const { mutate: logout } = useLogout();

  const handleSignOut = () => {
    logout(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setWindows([]);
        navigate("/sign-in");
        logoutUser();
      },
      onError: (error) => {
        console.error("로그아웃 실패:", error);
        queryClient.clear();
        setWindows([]);
        navigate("/sign-in");
      },
    });
  };

  const isActive = (path: string) =>
    pathname === path
      ? "bg-dark text-[var(--text-selected)]"
      : "bg-primary text-dark";

  return (
    <div className="flex justify-center gap-2 pt-8 w-full">
      <>
        <Link
          className={`${isActive("/my-page/record")} mypage-button`}
          to="/my-page/record"
        >
          <IoTime />
          시간 기록
        </Link>
        <Link
          className={`${isActive("/my-page/statistics")} mypage-button`}
          to="/my-page/statistics"
        >
          <IoLibrary />
          시간 통계
        </Link>
        <Link
          to="/my-page/theme-setting"
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
    </div>
  );
};
