"use client";

import { useGetTimerAnalytics } from "@/apis/services/timer-services/query";
import YearMonthSelector from "@/components/year-month-selector";
import { formatTime } from "@/utils/formatTime";
import { useState } from "react";

const StatisticsPage = () => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const { data } = useGetTimerAnalytics(year, month);
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

      <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        <div className="p-4 border-2 border-[#255f38] rounded-xl bg-[#255f38] shadow-sm">
          <p className="text-sm font-medium text-[#a0c878]">
            오늘의 목표 달성률
          </p>
          <div className="text-3xl font-bold text-white">
            {data?.achievementRateToday || 0}%
          </div>
        </div>

        <div className="p-4 border-2 border-[#255f38] rounded-xl bg-white shadow-sm">
          <p className="text-xl text-[#255f38] font-bold">월별 비교</p>
          <p className="mt-1">
            이번 달: {formatTime(data?.monthComparison?.currentMonthTotal || 0)}
          </p>
          <p>
            지난 달:{" "}
            {formatTime(data?.monthComparison?.previousMonthTotal || 0)}
          </p>
          <p
            className={`font-bold ${
              data?.monthComparison.difference || 0 >= 0
                ? "text-[#A0C878]"
                : "text-[#FFA27F]"
            }`}
          >
            {data?.monthComparison?.difference || 0 >= 0 ? "+" : ""}
            {formatTime(data?.monthComparison?.difference || 0)} (
            {data?.monthComparison?.changeRate || 0}%)
          </p>
        </div>

        <div className="p-4 border-2 border-[#255f38] rounded-xl bg-white shadow-sm md:col-span-2">
          <p className="text-xl font-bold mb-2 text-[#255f38]">
            요일별 집중 시간
          </p>
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

        <div className="p-4 border-2 border-[#255f38] rounded-xl bg-[#FFF085] shadow-sm col-span-1 md:col-span-2 lg:col-span-1">
          <p className="text-xl font-bold text-[#255f38]">최고 집중일</p>
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

export default StatisticsPage;
