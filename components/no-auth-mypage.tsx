"use client";

import { useRouter } from "next/navigation";
import RectangleButton from "./rectangle-button";

const NoAuthMyPage = () => {
  const router = useRouter();

  return (
    <div className="p-5">
      <RectangleButton
        onClick={() => router.push("/sign-in")}
        width="w-[50%] min-w-[200px]"
      >
        Sign In
      </RectangleButton>
      <RectangleButton
        onClick={() => router.push("/sign-up")}
        width="w-[50%] min-w-[200px]"
      >
        Sign Up
      </RectangleButton>
    </div>
  );
};

export default NoAuthMyPage;
