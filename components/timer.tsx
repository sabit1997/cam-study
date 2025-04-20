"use client";

import React, { useState, useRef, useEffect } from "react";

const Timer = () => {
  const [time, setTime] = useState({ hour: 0, min: 0, sec: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setTime((prev) => {
        let { hour, min, sec } = prev;
        sec++;
        if (sec >= 60) {
          sec = 0;
          min++;
        }
        if (min >= 60) {
          min = 0;
          hour++;
        }
        return { hour, min, sec };
      });
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

  const { hour, min, sec } = time;
  return (
    <div className="flex flex-col items-center gap-2 text-[#255f38]">
      <span className="text-2xl font-mono">{`${hour
        .toString()
        .padStart(2, "0")} : ${min.toString().padStart(2, "0")} : ${sec
        .toString()
        .padStart(2, "0")}`}</span>
      <div className="flex gap-2">
        <button
          className="px-4 py-2 bg-green-500 text-white rounded"
          onClick={startTimer}
        >
          시작
        </button>
        <button
          className="px-4 py-2 bg-red-500 text-white rounded"
          onClick={stopTimer}
        >
          멈춤
        </button>
      </div>
    </div>
  );
};

export default Timer;
