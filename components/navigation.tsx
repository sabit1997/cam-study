"use client";

import { useWindowStore } from "@/stores/window-state";
import { useRouter, usePathname } from "next/navigation";
import { FaCirclePlus } from "react-icons/fa6";
import { IoHomeSharp } from "react-icons/io5";
import { GoPersonFill } from "react-icons/go";

const Navigation = () => {
  const router = useRouter();
  const pathname = usePathname();
  const addWindow = useWindowStore((state) => state.addWindows);

  const isActiveP = (path: string) =>
    pathname === path
      ? "bg-[#255f38] text-white"
      : "bg-[#a0c878] text-[#255f38]";

  const isActiveImage = (path: string) =>
    pathname === path ? "bg-[#727D73]/50 border border-[#255f38]/50" : "";

  return (
    <ul className="flex gap-10 px-20 py-5">
      <li>
        <button onClick={addWindow} className="group">
          <FaCirclePlus className="text-8xl mb-3 text-[#255f38] group-active:bg-[#727D73]/50 group-active:border group-active:border-[#255f38]/50" />
          <p className="p-0.5 border-2 rounded-md border-[#255f38] bg-[#a0c878] text-black group-active:bg-[#255f38] group-active:text-white">
            ADD
          </p>
        </button>
      </li>
      <li>
        <button onClick={() => router.push("/")}>
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
        <button onClick={() => router.push("/mypage")}>
          <GoPersonFill
            className={`text-8xl mb-3 text-[#255f38] ${isActiveImage(
              "/mypage"
            )}`}
          />
          <p
            className={`p-0.5 border-2 rounded-md border-[#255f38] ${isActiveP(
              "/mypage"
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
