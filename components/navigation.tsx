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

  const isActive = (path: string) =>
    pathname === path
      ? "bg-[#255f38] text-white"
      : "bg-[#a0c878] text-[#255f38]";

  return (
    <ul className="flex gap-10 px-20 py-5">
      <li>
        <button onClick={addWindow}>
          <FaCirclePlus className="text-8xl mb-3 text-[#255f38]" />
          <p className="p-0.5 border-2 rounded-md border-[#255f38] bg-[#a0c878] text-black">
            ADD
          </p>
        </button>
      </li>
      <li>
        <button onClick={() => router.push("/")}>
          <IoHomeSharp className="text-8xl mb-3 text-[#255f38]" />
          <p
            className={`p-0.5 border-2 rounded-md border-[#255f38] ${isActive(
              "/"
            )}`}
          >
            HOME
          </p>
        </button>
      </li>
      <li>
        <button onClick={() => router.push("/mypage")}>
          <GoPersonFill className="text-8xl mb-3 text-[#255f38]" />
          <p
            className={`p-0.5 border-2 rounded-md border-[#255f38] ${isActive(
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
