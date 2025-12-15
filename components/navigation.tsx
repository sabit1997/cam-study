"use client";

import { usePathname } from "next/navigation";
import { IoHomeSharp, IoPaperPlane } from "react-icons/io5";
import { GoPersonFill } from "react-icons/go";
import Link from "next/link";
import { useUserStore } from "@/stores/user-state";
import TooltipWrapper from "./TooltipWrapper";
import { useEffect, useState } from "react";

const Navigation = () => {
  const pathname = usePathname();
  const username = useUserStore((state) => state.username);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const checkActive = (path: string) => {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <div className="flex justify-between items-center">
      <ul className="flex gap-10 px-20 py-5">
        <li>
          <Link href="/" className="cursor-pointer group">
            <IoHomeSharp
              className={`text-8xl mb-3 text-dark transition-colors ${
                checkActive("/") ? "bg-[#727D73]/50 border border-dark/50" : ""
              }`}
            />
            <p
              className={`p-0.5 border-2 rounded-md border-dark text-center font-medium ${
                checkActive("/")
                  ? "bg-dark text-[var(--text-selected)]"
                  : "bg-primary text-dark"
              }`}
            >
              HOME
            </p>
          </Link>
        </li>

        <li>
          <Link href="/my-page/record" className="cursor-pointer group">
            <GoPersonFill
              className={`text-8xl mb-3 text-dark transition-colors ${
                checkActive("/my-page")
                  ? "bg-[#727D73]/50 border border-dark/50"
                  : ""
              }`}
            />
            <p
              className={`p-0.5 border-2 rounded-md border-dark text-center font-medium ${
                checkActive("/my-page")
                  ? "bg-dark text-[var(--text-selected)]"
                  : "bg-primary text-dark"
              }`}
            >
              {mounted && username ? username : "MY PAGE"}
            </p>
          </Link>
        </li>
      </ul>

      <ul className="flex gap-5 px-4 mb-auto pt-3">
        <li>
          <TooltipWrapper content="버그 리포트 보내기">
            <a
              href="https://forms.gle/tNZ9ApZpkQptFjMp6"
              target="_blank"
              rel="noopener noreferrer"
            >
              <IoPaperPlane className="text-4xl text-dark hover:text-blue-600 transition-colors" />
            </a>
          </TooltipWrapper>
        </li>
      </ul>
    </div>
  );
};

export default Navigation;
