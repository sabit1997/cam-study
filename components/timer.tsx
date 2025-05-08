"use client";

import React, { useState, useRef, useEffect } from "react";
import { IoPlay, IoPauseSharp } from "react-icons/io5";
import { formatSeconds } from "@/utils/formatSeconds";

const Timer = () => {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (!timerRef.current) return;
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-2 text-[#255f38] h-full">
      <span className="text-2xl font-mono">{formatSeconds(seconds)}</span>
      <div className="flex gap-2">
        <button
          disabled={!!timerRef.current}
          className="p-5 rounded-full text-white bg-[#255f38] disabled:bg-gray-400 disabled:cursor-not-allowed"
          onClick={startTimer}
        >
          <IoPlay />
        </button>
        <button
          disabled={!timerRef.current}
          className="p-5 bg-[#255f38] text-white rounded-full disabled:bg-gray-400 disabled:cursor-not-allowed"
          onClick={stopTimer}
        >
          <IoPauseSharp />
        </button>
      </div>
    </div>
  );
};

export default Timer;
