"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { IoPlay, IoPauseSharp } from "react-icons/io5";
import { formatSeconds } from "@/utils/formatSeconds";
import { useGetTodayTime } from "@/apis/services/timer-services/query";
import { usePostTime } from "@/apis/services/timer-services/mutation";

const Timer: React.FC = () => {
  const { data: todayTimeRes, isPending: isTodayTimePending } =
    useGetTodayTime();
  const { mutate: postTime, isPending } = usePostTime();

  const [elapsed, setElapsed] = useState(0);
  const [goalInSeconds, setGoalInSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startAtRef = useRef<Date | null>(null);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (startAtRef.current) {
        const end = new Date();
        postTime({
          startAt: startAtRef.current.toISOString(),
          endAt: end.toISOString(),
        });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [postTime]);

  useEffect(() => {
    if (!isTodayTimePending && todayTimeRes) {
      setElapsed(todayTimeRes?.totalSeconds);
      setGoalInSeconds(todayTimeRes?.goalInSeconds);
    }
  }, [todayTimeRes, isTodayTimePending]);

  const startTimer = useCallback(() => {
    if (timerRef.current || isPending) return;

    const now = new Date();
    startAtRef.current = now;

    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    saveRef.current = setInterval(() => {
      if (isPending || !startAtRef.current) return;
      const end = new Date();
      postTime({
        startAt: startAtRef.current.toISOString(),
        endAt: end.toISOString(),
      });
      startAtRef.current = end;
    }, 60000);
  }, [postTime]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (saveRef.current) {
      clearInterval(saveRef.current);
      saveRef.current = null;
    }
    if (startAtRef.current && !isPending) {
      const end = new Date();
      postTime({
        startAt: startAtRef.current.toISOString(),
        endAt: end.toISOString(),
      });
    }
    startAtRef.current = null;
  }, [postTime]);

  const percent = (elapsed / goalInSeconds) * 100;

  return (
    <div className="flex flex-col items-center justify-center gap-4 text-dark h-full">
      <span className="text-2xl font-mono">{formatSeconds(elapsed)}</span>
      <div className="flex gap-2">
        <button
          disabled={Boolean(timerRef.current)}
          onClick={startTimer}
          className="p-5 rounded-full text-[var(--text-selected)] bg-dark disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <IoPlay />
        </button>
        <button
          disabled={!timerRef.current}
          onClick={stopTimer}
          className="p-5 rounded-full text-[var(--text-selected)] bg-dark disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <IoPauseSharp />
        </button>
      </div>
      <div className="flex items-center gap-3 w-full px-3">
        <span>Goal</span>
        <div className="w-full bg-gray-300 h-2 rounded-full overflow-hidden">
          <div
            className="h-2 bg-dark transition-all duration-300 ease-linear "
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default Timer;
