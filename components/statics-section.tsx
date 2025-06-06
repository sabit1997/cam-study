"use client";

import { useGetTimerAnalytics } from "@/apis/services/timer-services/query";
import { getCurrentMonthYear } from "@/utils/get-current-month-year";
import { useState } from "react";
import { Loading } from "./loading";
import { Error } from "./error";
import YearMonthSelector from "./year-month-selector";
import { formatTime } from "@/utils/formatTime";

const StaticSection = () => {
  const { currentYear, currentMonth } = getCurrentMonthYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const { data, isPending, isError } = useGetTimerAnalytics(year, month);

  if (isPending) return <Loading />;
  if (isError || !data) return <Error />;
  return (
    <div className="w-full flex flex-col items-center">
      <YearMonthSelector
        year={year}
        month={month}
        currentYear={currentYear}
        currentMonth={currentMonth}
        setYear={setYear}
        setMonth={setMonth}
      />
      <span className="text-sm">* 최대 2년간의 기록을 볼 수 있습니다.</span>

      <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 p-4">
        <div className="p-4 border-2 border-dark rounded-xl bg-dark shadow-sm">
          <p className="text-sm font-medium text-primary">오늘의 목표 달성률</p>
          <div className="text-3xl font-bold text-[var(--text-selected)]">
            {(data?.achievementRateToday ?? 0).toFixed(2)}%
          </div>
        </div>

        <div className="p-4 border-2 border-dark rounded-xl bg-white shadow-sm">
          <p className="text-xl text-dark font-bold">월별 비교</p>
          <p className="mt-1">
            이번 달: {formatTime(data?.monthComparison?.currentMonthTotal || 0)}
          </p>
          <p>
            지난 달:{" "}
            {formatTime(data?.monthComparison?.previousMonthTotal || 0)}
          </p>
          <p
            className={`font-bold ${
              data?.monthComparison?.difference || 0 >= 0
                ? "text-[#72BF78]"
                : "text-[#F75A5A]"
            }`}
          >
            {data?.monthComparison?.difference || 0 >= 0 ? "+" : ""}
            {formatTime(data?.monthComparison?.difference || 0)} (
            {data?.monthComparison?.changeRate || 0}%)
          </p>
        </div>

        <div className="p-4 border-2 border-dark rounded-xl bg-white shadow-sm md:col-span-1">
          <p className="text-xl font-bold mb-2 text-dark">요일별 집중 시간</p>
          <ul>
            {data?.weekdayStats &&
            Object.entries(data?.weekdayStats || []).length > 0 ? (
              Object.entries(data?.weekdayStats || []).map(([day, sec]) => (
                <li key={day} className="text-sm">
                  {day[0] + day.slice(1).toLowerCase()}: {formatTime(sec)}
                </li>
              ))
            ) : (
              <li>데이터가 없습니다.</li>
            )}
          </ul>
        </div>

        <div className="p-4 border-2 border-dark rounded-xl bg-[#FFF085] shadow-sm col-span-1 md:col-span-1 lg:col-span-1">
          <p className="text-xl font-bold text-dark">최고 집중일</p>
          <p className="font-bold text-lg">
            {data?.bestFocusDay?.date || "데이터가 없습니다"}
          </p>
          <p>집중 시간: {formatTime(data?.bestFocusDay?.totalSeconds || 0)}</p>
          <p>목표 시간: {data?.bestFocusDay?.dailyHourGoal || 0}h</p>
        </div>
      </div>
    </div>
  );
};

export default StaticSection;
