"use client";

import { useRouter, usePathname } from "next/navigation";
import { IoHomeSharp } from "react-icons/io5";
import { GoPersonFill } from "react-icons/go";

const Navigation = () => {
  const router = useRouter();
  const pathname = usePathname();

  const isActiveP = (path: string) =>
    pathname === path
      ? "bg-[#255f38] text-white"
      : "bg-[#a0c878] text-[#255f38]";

  const isActiveImage = (path: string) =>
    pathname === path ? "bg-[#727D73]/50 border border-[#255f38]/50" : "";

  return (
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
          onClick={() => router.push("/my-page")}
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
  );
};

export default Navigation;
