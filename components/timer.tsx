"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { IoPlay, IoPauseSharp } from "react-icons/io5";
import { formatSeconds } from "@/utils/formatSeconds";
import { useGetTodayTime } from "@/apis/services/timer-services/query";
import { usePostTime } from "@/apis/services/timer-services/mutation";
import { Loading } from "./loading";
import { Error } from "./error";

const Timer: React.FC = () => {
  const { data: todayTimeRes, isPending, isError } = useGetTodayTime();
  const { mutate: postTime } = usePostTime();

  const [elapsed, setElapsed] = useState(0);
  const [startAt, setStartAt] = useState<Date | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (startAt) {
        const end = new Date();
        postTime({ startAt: startAt.toISOString(), endAt: end.toISOString() });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [startAt, postTime]);

  const startTimer = useCallback(() => {
    if (timerRef.current || !todayTimeRes) return;

    const now = new Date();
    setStartAt(now);
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    saveRef.current = setInterval(() => {
      if (!startAt) return;
      const end = new Date();
      postTime({ startAt: startAt.toISOString(), endAt: end.toISOString() });
      setStartAt(end);
      setElapsed(0);
    }, 60000);
  }, [todayTimeRes, startAt, postTime]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (saveRef.current) {
      clearInterval(saveRef.current);
      saveRef.current = null;
    }
    if (startAt) {
      const end = new Date();
      postTime({ startAt: startAt.toISOString(), endAt: end.toISOString() });
    }
    setStartAt(null);
    setElapsed(0);
  }, [startAt, postTime]);

  if (isPending) return <Loading />;
  if (isError || !todayTimeRes) return <Error />;

  const { totalSeconds = 0, goalInSeconds = 1 } = todayTimeRes;
  const current = totalSeconds + elapsed;
  const percent = Math.min((current / goalInSeconds) * 100, 100);

  return (
    <div className="flex flex-col items-center justify-center gap-4 text-dark h-full">
      <span className="text-2xl font-mono">{formatSeconds(current)}</span>
      <div className="flex gap-2">
        <button
          disabled={Boolean(timerRef.current)}
          onClick={startTimer}
          className="p-5 rounded-full text-white bg-dark disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <IoPlay />
        </button>
        <button
          disabled={!timerRef.current}
          onClick={stopTimer}
          className="p-5 rounded-full text-white bg-dark disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <IoPauseSharp />
        </button>
      </div>
      <div className="flex items-center gap-3 w-full px-3">
        <span>Goal</span>
        <div className="w-full bg-gray-300 h-2 rounded-full overflow-hidden">
          <div className="h-2 bg-dark" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
};

export default Timer;
