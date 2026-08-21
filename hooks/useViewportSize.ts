import { useState, useEffect } from "react";

const useViewportSize = (delay = 100) => {
  const [size, setSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1920,
    height: typeof window !== "undefined" ? window.innerHeight : 1080,
  }));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const handleResize = () => {
      clearTimeout(timer); // ① 이전 예약 취소
      timer = setTimeout(() => {
        // ② 새로 예약
        const next = { width: window.innerWidth, height: window.innerHeight };
        setSize((prev) =>
          // ③ 같은 값이면 같은 참조
          prev.width === next.width && prev.height === next.height
            ? prev
            : next
        );
      }, delay);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      // ④ 정리
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [delay]);

  return { vw: size.width, vh: size.height };
};

export default useViewportSize;
