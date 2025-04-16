"use client";

import NoAuthMyPage from "@/components/no-auth-mypage";
import RectangleButton from "@/components/rectangle-button";
import { useCurrentUser, useSignOut } from "@/hooks/useAuth";

const MyPage = () => {
  const { data: user, isLoading, isPending } = useCurrentUser();
  const { mutate: signOut } = useSignOut();

  const handleSignOut = () => {
    signOut(undefined, {
      onSuccess: () => {
        alert("로그아웃 성공!");
      },
      onError: () => {
        alert("로그아웃 실패. 다시 시도해주세요.");
      },
    });
  };

  if (isLoading) return <p>Loading...</p>;
  if (!user) return <NoAuthMyPage />;
  return (
    <RectangleButton
      width="w-[200px]"
      onClick={handleSignOut}
      disabled={isPending}
    >
      Sign Out
    </RectangleButton>
  );
};

export default MyPage;
