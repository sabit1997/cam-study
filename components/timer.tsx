"use client";

import React, { useState, useRef, useEffect } from "react";
import { IoPlay, IoPauseSharp } from "react-icons/io5";
import { formatSeconds } from "@/utils/formatSeconds";
import { useGetTodayTime } from "@/apis/services/timer-services/query";
import { usePostTime } from "@/apis/services/timer-services/mutation";

const Timer = () => {
  const [seconds, setSeconds] = useState(0);
  const [startAt, setStartAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: todayTimeRes } = useGetTodayTime();
  const todayTime = todayTimeRes?.totalSeconds ?? 0;

  const { mutate: postTime } = usePostTime();

  const startTimer = () => {
    if (timerRef.current) return;

    const now = new Date();
    setStartAt(now);

    timerRef.current = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    autoSaveRef.current = setInterval(() => {
      if (!startAt) return;
      const end = new Date();
      postTime({ startAt: startAt.toISOString(), endAt: end.toISOString() });
      setStartAt(end);
      setSeconds(0);
    }, 60000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoSaveRef.current) {
      clearInterval(autoSaveRef.current);
      autoSaveRef.current = null;
    }

    if (startAt) {
      const end = new Date();
      postTime({ startAt: startAt.toISOString(), endAt: end.toISOString() });
    }

    setStartAt(null);
    setSeconds(0);
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      stopTimer();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [startAt]);

  return (
    <div className="flex flex-col items-center justify-center gap-2 text-[#255f38] h-full">
      <span className="text-2xl font-mono">
        {formatSeconds(todayTime + seconds)}
      </span>
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
