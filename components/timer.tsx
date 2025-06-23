"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { IoPlay, IoPauseSharp } from "react-icons/io5";
import { formatSeconds } from "@/utils/formatSeconds";
import { useGetTodayTime } from "@/apis/services/timer-services/query";
import {
  usePostTime,
  useResetTime,
} from "@/apis/services/timer-services/mutation";
import { LuTimerReset } from "react-icons/lu";

const Timer: React.FC = () => {
  const { data: todayTimeRes, isPending: isTodayTimePending } =
    useGetTodayTime();
  const todayDate = new Date().toISOString().split("T")[0];
  const { mutate: postTime, isPending: isPostTimePending } = usePostTime();
  const { mutate: resetTime, isPending: isResetTimePending } =
    useResetTime(todayDate);

  const [elapsed, setElapsed] = useState(0);
  const [goalInSeconds, setGoalInSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startAtRef = useRef<Date | null>(null);
  const baseTotalSecondsRef = useRef<number>(0);

  useEffect(() => {
    if (!isTodayTimePending && todayTimeRes) {
      const total = todayTimeRes.totalSeconds || 0;
      baseTotalSecondsRef.current = total;
      setElapsed(total);
      setGoalInSeconds((todayTimeRes.dailyHourGoal || 0) * 3600);
    }
  }, [todayTimeRes, isTodayTimePending]);

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
      if (timerRef.current) clearInterval(timerRef.current);
      if (saveRef.current) clearInterval(saveRef.current);
    };
  }, [postTime]);

  const startTimer = useCallback(() => {
    if (timerRef.current || isPostTimePending) return;
    startAtRef.current = new Date();

    timerRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);

    saveRef.current = setInterval(() => {
      if (!startAtRef.current) return;
      const now = new Date();
      const deltaSec = Math.floor(
        (now.getTime() - startAtRef.current.getTime()) / 1000
      );
      const corrected = baseTotalSecondsRef.current + deltaSec;
      setElapsed(corrected);
      postTime({
        startAt: startAtRef.current.toISOString(),
        endAt: now.toISOString(),
      });
      baseTotalSecondsRef.current = corrected;
      startAtRef.current = now;
    }, 60000);
  }, [postTime, isPostTimePending]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (saveRef.current) {
      clearInterval(saveRef.current);
      saveRef.current = null;
    }
    if (startAtRef.current) {
      const end = new Date();
      const deltaSec = Math.floor(
        (end.getTime() - startAtRef.current.getTime()) / 1000
      );
      const corrected = baseTotalSecondsRef.current + deltaSec;
      setElapsed(corrected);
      postTime({
        startAt: startAtRef.current.toISOString(),
        endAt: end.toISOString(),
      });
      baseTotalSecondsRef.current = corrected;
    }
    startAtRef.current = null;
  }, [postTime]);

  const percent = goalInSeconds > 0 ? (elapsed / goalInSeconds) * 100 : 0;
  const displayPercent = Math.min(percent, 100);

  const resetTimer = () => {
    if (isResetTimePending) return;
    resetTime();
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 text-dark h-full">
      <span className="text-2xl font-mono">{formatSeconds(elapsed)}</span>
      <div className="flex gap-2">
        <button
          onClick={startTimer}
          disabled={Boolean(timerRef.current)}
          className="p-5 rounded-full text-[var(--text-selected)] bg-dark disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <IoPlay />
        </button>
        <button
          onClick={stopTimer}
          disabled={!Boolean(timerRef.current)}
          className="p-5 rounded-full text-[var(--text-selected)] bg-dark disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <IoPauseSharp />
        </button>
        <button
          onClick={resetTimer}
          disabled={
            elapsed === 0 || isResetTimePending || Boolean(timerRef.current)
          }
          className="p-5 rounded-full text-[var(--text-selected)] bg-dark disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <LuTimerReset />
        </button>
      </div>
      <div className="flex items-center gap-3 w-full px-3">
        <span>Goal</span>
        <div className="w-full bg-gray-300 h-2 rounded-full overflow-hidden">
          <div
            className="h-2 bg-dark transition-all duration-300 ease-linear"
            style={{ width: `${displayPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default Timer;
