import { useEffect, useState } from "react";

type ViewportSize = { width: number; height: number };

const useViewportSize = (delay = 100) => {
  const [size, setSize] = useState<ViewportSize>(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1920,
    height: typeof window !== "undefined" ? window.innerHeight : 1080,
  }));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const handleResize = () => {
      // 구독 개수의 직접 증거 — 창 5개면 resize 1회에 5번 찍힌다
      window.__perf?.count("viewport.event");

      clearTimeout(timer); // ① 이전 예약 취소
      timer = setTimeout(() => {
        // ② 디바운스 만료 후 1회만 실행
        window.__perf?.count("viewport.set");

        const next = { width: window.innerWidth, height: window.innerHeight };
        setSize((prev) =>
          // ③ 값이 같으면 이전 참조를 그대로 반환 → 리렌더 없음
          prev.width === next.width && prev.height === next.height ? prev : next
        );
      }, delay);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      // ④ 정리 — 타이머와 리스너를 모두 해제
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [delay]);

  return { vw: size.width, vh: size.height };
};

export default useViewportSize;
