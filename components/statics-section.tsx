"use client";

import { useGetTimerAnalytics } from "@/apis/services/timer-services/query";
import { getCurrentMonthYear } from "@/utils/get-current-month-year";
import { useState } from "react";
import { Loading } from "./loading";
import { Error } from "./error";
import YearMonthSelector from "./year-month-selector";
import { formatTime } from "@/utils/formatTime";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const DAY_ORDER = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
const DAY_LABELS: Record<string, string> = {
  MONDAY: "월",
  TUESDAY: "화",
  WEDNESDAY: "수",
  THURSDAY: "목",
  FRIDAY: "금",
  SATURDAY: "토",
  SUNDAY: "일",
};

const StaticSection = () => {
  const { currentYear, currentMonth } = getCurrentMonthYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const { data, isPending, isError } = useGetTimerAnalytics(year, month);

  if (isPending) return <Loading />;
  if (isError || !data) return <Error />;

  const weekdayData = DAY_ORDER.map((day) => ({
    day: DAY_LABELS[day],
    hours:
      Math.round((((data.weekdayStats?.[day] as number) || 0) / 3600) * 10) /
      10,
  }));

  const monthData = [
    {
      name: "지난달",
      hours:
        Math.round(
          ((data.monthComparison?.previousMonthTotal || 0) / 3600) * 10
        ) / 10,
    },
    {
      name: "이번달",
      hours:
        Math.round(
          ((data.monthComparison?.currentMonthTotal || 0) / 3600) * 10
        ) / 10,
    },
  ];

  const diff = data.monthComparison?.difference || 0;
  const isPositive = diff >= 0;

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
          <p className="text-xl text-dark font-bold mb-1">월별 비교</p>
          <p
            className={`text-sm font-bold mb-2 ${
              isPositive ? "text-positive" : "text-negative"
            }`}
          >
            {isPositive ? "+" : ""}
            {formatTime(diff)} ({data.monthComparison?.changeRate || 0}%)
          </p>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={monthData} barSize={32}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                formatter={(v) => [`${v}h`, "집중 시간"]}
                cursor={{ fill: "transparent" }}
              />
              <Bar dataKey="hours" fill="#8fb870" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="p-4 border-2 border-dark rounded-xl bg-white shadow-sm md:col-span-1">
          <p className="text-xl font-bold mb-2 text-dark">요일별 집중 시간</p>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={weekdayData} barSize={20}>
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                formatter={(v) => [`${v}h`, "집중 시간"]}
                cursor={{ fill: "transparent" }}
              />
              <Bar dataKey="hours" fill="#8fb870" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="p-4 border-2 border-dark rounded-xl bg-accent shadow-sm col-span-1 md:col-span-1 lg:col-span-1">
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
