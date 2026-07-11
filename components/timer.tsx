"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { IoPlay, IoPauseSharp } from "react-icons/io5";
import { LuTimerReset, LuSkipForward } from "react-icons/lu";
import { formatSeconds } from "@/utils/formatSeconds";
import { playPomoSound } from "@/utils/pomoSound";
import PomodoroSettingsModal from "./modals/pomodoro-settings-modal";
import { useGetTodayTime } from "@/apis/services/timer-services/query";
import {
  usePostTime,
  useResetTime,
  usePatchPomoCycles,
} from "@/apis/services/timer-services/mutation";
import { toast } from "sonner";

type TimerMode = "stopwatch" | "pomodoro";
type PomoPhase = "work" | "break";

const DEFAULT_WORK_MINS = 25;
const DEFAULT_BREAK_MINS = 5;

function fmtMS(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(
    s % 60
  ).padStart(2, "0")}`;
}

const Timer: React.FC = () => {
  const { data: todayTimeRes, isPending: isTodayTimePending } =
    useGetTodayTime();
  const todayDate = new Date().toLocaleDateString("en-CA");
  const { mutate: postTime, isPending: isPostTimePending } = usePostTime();
  const { mutate: resetTime, isPending: isResetTimePending } =
    useResetTime(todayDate);
  const { mutate: patchCycles } = usePatchPomoCycles();

  // ── Stopwatch ──
  const [mode, setMode] = useState<TimerMode>("stopwatch");
  const [elapsed, setElapsed] = useState(0);
  const [goalInSeconds, setGoalInSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startAtRef = useRef<Date | null>(null);
  const baseTotalSecondsRef = useRef<number>(0);
  const isRunningRef = useRef(false);
  const goalReachedRef = useRef(false);

  // ── Pomodoro ──
  const [workMins, setWorkMins] = useState(() => {
    const v = parseInt(localStorage.getItem("pomo-work-mins") ?? "", 10);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_WORK_MINS;
  });
  const [breakMins, setBreakMins] = useState(() => {
    const v = parseInt(localStorage.getItem("pomo-break-mins") ?? "", 10);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_BREAK_MINS;
  });
  const [showPomoSettings, setShowPomoSettings] = useState(false);

  const workSecs = workMins * 60;
  const breakSecs = breakMins * 60;

  const pomoStateRef = useRef<{
    phase: PomoPhase;
    remaining: number;
    cycle: number;
  }>({
    phase: "work",
    remaining: workMins * 60,
    cycle: 0,
  });
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoPhase, setPomoPhase] = useState<PomoPhase>("work");
  const [pomoRemaining, setPomoRemaining] = useState(workMins * 60);
  const [pomoCycle, setPomoCycle] = useState(0);
  const pomoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pomoWorkStartRef = useRef<Date | null>(null);
  // 사이클은 초기 로드 시에만 서버에서 동기화한다.
  // postTime 성공 → today 쿼리 재조회 시 pomoCycles가 인메모리 카운터를 덮어쓰는 경쟁 조건 방지.
  const pomoInitializedRef = useRef(false);

  useEffect(() => {
    if (!isTodayTimePending && todayTimeRes) {
      const total = todayTimeRes.totalSeconds || 0;
      baseTotalSecondsRef.current = total;
      setElapsed(total);
      setGoalInSeconds((todayTimeRes.dailyHourGoal || 0) * 3600);
      if (!pomoInitializedRef.current) {
        pomoInitializedRef.current = true;
        const serverCycles = todayTimeRes.pomoCycles ?? 0;
        pomoStateRef.current.cycle = serverCycles;
        setPomoCycle(serverCycles);
      }
    }
  }, [todayTimeRes, isTodayTimePending]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const now = new Date();
      if (startAtRef.current) {
        postTime({
          startAt: startAtRef.current.toISOString(),
          endAt: now.toISOString(),
        });
      }
      if (pomoWorkStartRef.current) {
        postTime({
          startAt: pomoWorkStartRef.current.toISOString(),
          endAt: now.toISOString(),
        });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (timerRef.current) clearInterval(timerRef.current);
      if (saveRef.current) clearInterval(saveRef.current);
      if (pomoIntervalRef.current) clearInterval(pomoIntervalRef.current);
    };
  }, [postTime]);

  // ── Stopwatch controls ──
  const startTimer = useCallback(() => {
    if (
      timerRef.current ||
      saveRef.current ||
      isPostTimePending ||
      isRunningRef.current
    )
      return;
    isRunningRef.current = true;
    startAtRef.current = new Date();

    timerRef.current = setInterval(() => {
      if (!startAtRef.current) return;
      setElapsed(
        baseTotalSecondsRef.current +
          Math.floor((Date.now() - startAtRef.current.getTime()) / 1000)
      );
    }, 1000);

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
    isRunningRef.current = false;
  }, [postTime]);

  const resetTimer = () => {
    if (isResetTimePending) return;
    resetTime();
  };

  const percent = goalInSeconds > 0 ? (elapsed / goalInSeconds) * 100 : 0;
  const displayPercent = Math.min(percent, 100);

  useEffect(() => {
    if (goalInSeconds === 0) return;
    if (percent >= 100 && !goalReachedRef.current) {
      goalReachedRef.current = true;
      toast.success("목표 달성! 오늘도 수고했어요 🎉");
    }
    if (percent < 100) goalReachedRef.current = false;
  }, [percent, goalInSeconds]);

  // ── Pomodoro controls ──
  const pomoStart = useCallback(() => {
    if (pomoIntervalRef.current) return;
    setPomoRunning(true);
    if (pomoStateRef.current.phase === "work" && !pomoWorkStartRef.current) {
      pomoWorkStartRef.current = new Date();
    }
    pomoIntervalRef.current = setInterval(() => {
      const s = pomoStateRef.current;
      if (s.remaining <= 1) {
        const now = new Date();
        const nextPhase: PomoPhase = s.phase === "work" ? "break" : "work";
        if (s.phase === "work") {
          if (pomoWorkStartRef.current) {
            postTime({
              startAt: pomoWorkStartRef.current.toISOString(),
              endAt: now.toISOString(),
            });
            pomoWorkStartRef.current = null;
          }
          s.cycle++;
          patchCycles(s.cycle);
          playPomoSound("workDone");
          toast.success("집중 완료! 잠깐 쉬어가세요 ☕");
        } else {
          pomoWorkStartRef.current = now;
          playPomoSound("breakDone");
          toast.success("휴식 완료! 다시 집중해봐요 🍅");
        }
        s.phase = nextPhase;
        s.remaining = nextPhase === "work" ? workSecs : breakSecs;
      } else {
        s.remaining--;
      }
      setPomoPhase(s.phase);
      setPomoRemaining(s.remaining);
      setPomoCycle(s.cycle);
    }, 1000);
  }, [workSecs, breakSecs, postTime, patchCycles]);

  const pomoStop = useCallback(() => {
    if (pomoIntervalRef.current) {
      clearInterval(pomoIntervalRef.current);
      pomoIntervalRef.current = null;
    }
    if (pomoStateRef.current.phase === "work" && pomoWorkStartRef.current) {
      postTime({
        startAt: pomoWorkStartRef.current.toISOString(),
        endAt: new Date().toISOString(),
      });
      pomoWorkStartRef.current = null;
    }
    setPomoRunning(false);
  }, [postTime]);

  const pomoReset = useCallback(() => {
    if (pomoIntervalRef.current) {
      clearInterval(pomoIntervalRef.current);
      pomoIntervalRef.current = null;
    }
    pomoWorkStartRef.current = null;
    pomoStateRef.current = { phase: "work", remaining: workSecs, cycle: 0 };
    setPomoPhase("work");
    setPomoRemaining(workSecs);
    setPomoCycle(0);
    setPomoRunning(false);
    patchCycles(0);
  }, [workSecs, patchCycles]);

  const skipBreak = useCallback(() => {
    if (pomoStateRef.current.phase !== "break") return;
    pomoStateRef.current.phase = "work";
    pomoStateRef.current.remaining = workSecs;
    if (pomoRunning) pomoWorkStartRef.current = new Date();
    setPomoPhase("work");
    setPomoRemaining(workSecs);
  }, [workSecs, pomoRunning]);

  const applyPomoSettings = (w: number, b: number) => {
    setWorkMins(w);
    setBreakMins(b);
    localStorage.setItem("pomo-work-mins", String(w));
    localStorage.setItem("pomo-break-mins", String(b));
    if (pomoIntervalRef.current) {
      clearInterval(pomoIntervalRef.current);
      pomoIntervalRef.current = null;
    }
    // 설정 변경 직전까지 집중했던 시간 저장 (일시정지 없이 설정 창을 열 수는 없지만 방어적으로 처리)
    if (pomoWorkStartRef.current) {
      postTime({
        startAt: pomoWorkStartRef.current.toISOString(),
        endAt: new Date().toISOString(),
      });
      pomoWorkStartRef.current = null;
    }
    const newWorkSecs = w * 60;
    // 사이클은 하루 누적값이므로 설정 변경 시 초기화하지 않는다
    const currentCycle = pomoStateRef.current.cycle;
    pomoStateRef.current = {
      phase: "work",
      remaining: newWorkSecs,
      cycle: currentCycle,
    };
    setPomoPhase("work");
    setPomoRemaining(newWorkSecs);
    setPomoRunning(false);
  };

  // Pomodoro ring
  const pomoProgress =
    pomoPhase === "work"
      ? (workSecs - pomoRemaining) / workSecs
      : (breakSecs - pomoRemaining) / breakSecs;
  const pomoColor = pomoPhase === "work" ? "#8fb870" : "#e8a030";
  const circR = 52;
  const circ = 2 * Math.PI * circR;

  return (
    <div className="flex flex-col h-full">
      {/* Mode tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0">
        {(["stopwatch", "pomodoro"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              mode === m
                ? "text-dark border-b-2 border-[#8fb870]"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {m === "pomodoro" ? "🍅 포모도로" : "⏱ 스톱워치"}
          </button>
        ))}
      </div>

      {/* Stopwatch */}
      {mode === "stopwatch" && (
        <div className="flex flex-col items-center justify-center gap-4 h-full px-4">
          <span className="text-4xl font-light text-gray-800 tabular-nums">
            {formatSeconds(elapsed)}
          </span>
          <div className="flex gap-3">
            <button
              onClick={startTimer}
              disabled={Boolean(timerRef.current)}
              className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: "#8fb870" }}
            >
              <IoPlay size={18} />
            </button>
            <button
              onClick={stopTimer}
              disabled={!Boolean(timerRef.current)}
              className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: "#8fb870" }}
            >
              <IoPauseSharp size={18} />
            </button>
            <button
              onClick={resetTimer}
              disabled={
                elapsed === 0 || isResetTimePending || Boolean(timerRef.current)
              }
              className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: "#8fb870" }}
            >
              <LuTimerReset size={18} />
            </button>
          </div>
          {goalInSeconds > 0 && (
            <div className="flex items-center gap-3 w-full">
              <span className="text-xs text-gray-400 whitespace-nowrap">
                목표
              </span>
              <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-1.5 rounded-full transition-all duration-300 ease-linear"
                  style={{
                    width: `${displayPercent}%`,
                    background: "#8fb870",
                  }}
                />
              </div>
              <span className="text-xs text-gray-400 tabular-nums">
                {Math.round(displayPercent)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Pomodoro */}
      {mode === "pomodoro" && (
        <div className="flex flex-col items-center justify-center gap-4 h-full px-4">
          {/* Ring */}
          <div className="relative w-36 h-36">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 136 136">
              <circle
                cx="68"
                cy="68"
                r={circR}
                fill="none"
                stroke="#f0f0f0"
                strokeWidth="8"
              />
              <circle
                cx="68"
                cy="68"
                r={circR}
                fill="none"
                stroke={pomoColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - pomoProgress)}
                style={{
                  transition: "stroke-dashoffset 1s linear, stroke 0.5s",
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-light text-gray-800 tabular-nums">
                {fmtMS(pomoRemaining)}
              </span>
              <span
                className="text-[11px] font-semibold mt-0.5 uppercase tracking-wider"
                style={{ color: pomoColor }}
              >
                {pomoPhase === "work" ? "집중" : "휴식"}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-3 items-center">
            <button
              onClick={pomoRunning ? pomoStop : pomoStart}
              className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md transition-transform hover:scale-105 active:scale-95"
              style={{ background: pomoRunning ? "#ff3b30" : pomoColor }}
            >
              {pomoRunning ? <IoPauseSharp size={18} /> : <IoPlay size={18} />}
            </button>
            <button
              onClick={pomoReset}
              className="w-10 h-10 rounded-full flex items-center justify-center border-2 border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors"
            >
              <LuTimerReset size={15} />
            </button>
            {pomoPhase === "break" && (
              <button
                onClick={skipBreak}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border-2 border-orange-200 text-orange-400 hover:border-orange-300 hover:text-orange-500 transition-colors"
              >
                <LuSkipForward size={13} />
                건너뛰기
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="text-center space-y-1">
            <p className="text-xs text-gray-400">
              완료 사이클:{" "}
              <span className="font-semibold text-gray-600">{pomoCycle}</span>
            </p>
            <button
              onClick={() => {
                if (!pomoRunning) setShowPomoSettings(true);
              }}
              className="text-xs text-gray-300 hover:text-gray-400 transition-colors underline-offset-2 hover:underline"
            >
              {workMins}분 집중 · {breakMins}분 휴식
            </button>
          </div>

          {showPomoSettings && (
            <PomodoroSettingsModal
              workMins={workMins}
              breakMins={breakMins}
              onApply={applyPomoSettings}
              onClose={() => setShowPomoSettings(false)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default Timer;
