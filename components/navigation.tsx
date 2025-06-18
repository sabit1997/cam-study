"use client";

import { usePathname } from "next/navigation";
import { IoHomeSharp } from "react-icons/io5";
import { GoPersonFill } from "react-icons/go";
import Link from "next/link";
import { useUserStore } from "@/stores/user-state";

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
    </div>
  );
};

export default Navigation;
