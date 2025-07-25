import { useEffect, useRef } from "react";

const useScreenSizeRef = () => {
  const screenWidthRef = useRef<null | number>(null);
  const screenHeightRef = useRef<null | number>(null);

  useEffect(() => {
    const updateSize = () => {
      screenWidthRef.current = window.innerWidth;
      screenHeightRef.current = window.innerHeight;
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  return { screenWidthRef, screenHeightRef };
};

export default useScreenSizeRef;
