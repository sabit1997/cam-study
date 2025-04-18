"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

const PUBLIC_PATHS = ["/sign-in", "/sign-up"];

export default function useAuthRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("AccessToken");
    const isPublic = PUBLIC_PATHS.includes(pathname);

    if (!token && !isPublic) {
      router.replace("/sign-in");
    } else if (token) {
      setIsLoggedIn(true);
      if (isPublic) {
        router.replace("/");
      }
    }
  }, [pathname, router]);

  return { isLoggedIn };
}
