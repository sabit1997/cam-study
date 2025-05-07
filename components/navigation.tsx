"use client";

import { useRouter, usePathname } from "next/navigation";
import { IoHomeSharp } from "react-icons/io5";
import { GoPersonFill } from "react-icons/go";
// import Timer from "./timer";

const Navigation = () => {
  const router = useRouter();
  const pathname = usePathname();

  const isActiveP = (path: string) => {
    const isActive =
      path === "/"
        ? pathname === path
        : pathname === path || pathname.startsWith(`${path}/`);
    return isActive ? "bg-[#255f38] text-white" : "bg-[#a0c878] text-[#255f38]";
  };

  const isActiveImage = (path: string) => {
    const isActive =
      path === "/"
        ? pathname === path
        : pathname === path || pathname.startsWith(`${path}/`);
    return isActive ? "bg-[#727D73]/50 border border-[#255f38]/50" : "";
  };

  return (
    <div className="flex justify-between items-center">
      <ul className="flex gap-10 px-20 py-5">
        <li>
          <button
            onClick={() => router.push("/")}
            className="cursor-pointer"
            type="button"
          >
            <IoHomeSharp
              className={`text-8xl mb-3 text-[#255f38] ${isActiveImage("/")}`}
            />
            <p
              className={`p-0.5 border-2 rounded-md border-[#255f38] ${isActiveP(
                "/"
              )}`}
            >
              HOME
            </p>
          </button>
        </li>
        <li>
          <button
            onClick={() => router.push("/my-page/record")}
            className="cursor-pointer"
            type="button"
          >
            <GoPersonFill
              className={`text-8xl mb-3 text-[#255f38] ${isActiveImage(
                "/my-page"
              )}`}
            />
            <p
              className={`p-0.5 border-2 rounded-md border-[#255f38] ${isActiveP(
                "/my-page"
              )}`}
            >
              MY PAGE
            </p>
          </button>
        </li>
      </ul>
      {/* <Timer /> */}
    </div>
  );
};

export default Navigation;
