"use client";

import { usePathname } from "next/navigation";
import { IoHomeSharp } from "react-icons/io5";
import { IoPaperPlane } from "react-icons/io5";
import { IoBook } from "react-icons/io5";
import { GoPersonFill } from "react-icons/go";
import Link from "next/link";
import { useUserStore } from "@/stores/user-state";
import TooltipWrapper from "./TooltipWrapper";

const Navigation = () => {
  const pathname = usePathname();
  const username = useUserStore((state) => state.username);

  const isActiveP = (path: string) => {
    const isActive =
      path === "/"
        ? pathname === path
        : pathname === path || pathname.startsWith(`${path}/`);
    return isActive
      ? "bg-dark text-[var(--text-selected)]"
      : "bg-primary text-dark";
  };

  const isActiveImage = (path: string) => {
    const isActive =
      path === "/"
        ? pathname === path
        : pathname === path || pathname.startsWith(`${path}/`);
    return isActive ? "bg-[#727D73]/50 border border-dark/50" : "";
  };

  return (
    <div className="flex justify-between items-center">
      <ul className="flex gap-10 px-20 py-5">
        <li>
          <Link href="/" className="cursor-pointer" type="button">
            <IoHomeSharp
              className={`text-8xl mb-3 text-dark ${isActiveImage("/")}`}
            />
            <p
              className={`p-0.5 border-2 rounded-md border-dark text-center ${isActiveP(
                "/"
              )}`}
            >
              HOME
            </p>
          </Link>
        </li>
        <li>
          <Link href="/my-page/record" className="cursor-pointer" type="button">
            <GoPersonFill
              className={`text-8xl mb-3 text-dark ${isActiveImage("/my-page")}`}
            />
            <p
              className={`p-0.5 border-2 rounded-md border-dark text-center ${isActiveP(
                "/my-page"
              )}`}
            >
              {username ? username : "MY PAGE"}
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
              <IoPaperPlane className="text-4xl text-dark" />
            </a>
          </TooltipWrapper>
        </li>
        {/* TODO: 가이드 모달 생성 후 주석 제거 */}
        {/* <li>
          <TooltipWrapper content="가이드북 보기">
            <button>
              <IoBook className="text-4xl text-dark" />
            </button>
          </TooltipWrapper>
        </li> */}
      </ul>
    </div>
  );
};

export default Navigation;
