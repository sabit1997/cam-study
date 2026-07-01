import { useState, useEffect } from "react";

const useScreenSizeRef = () => {
  const [vw, setVw] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1920
  );
  const [vh, setVh] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 1080
  );

  useEffect(() => {
    const update = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return { vw, vh };
};

export default useScreenSizeRef;
