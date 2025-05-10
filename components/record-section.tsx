"use client";

import { useGetMonthTime } from "@/apis/services/timer-services/query";
import { formatSeconds } from "@/utils/formatSeconds";
import { useState } from "react";
import YearMonthSelector from "./year-month-selector";
import { Loading } from "./loading";
import { Error } from "./error";
import { getCurrentMonthYear } from "@/utils/get-current-month-year";

export const RecordSection = () => {
  const { currentYear, currentMonth } = getCurrentMonthYear();

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const { data, isPending, isError } = useGetMonthTime(year, month);

  if (isPending) return <Loading />;
  if (isError || !data) return <Error />;

  return (
    <div className="pt-8">
      <YearMonthSelector
        year={year}
        month={month}
        currentYear={currentYear}
        currentMonth={currentMonth}
        setYear={setYear}
        setMonth={setMonth}
      />
      <span className="text-sm">* 최대 2년간의 기록을 볼 수 있습니다.</span>
      <section>
        <table className="min-w-full border border-gray-300 text-sm text-left">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 border-b border-gray-300 font-bold">
                Date
              </th>
              <th className="px-4 py-2 border-b border-gray-300 font-bold">
                Time
              </th>
              <th className="px-4 py-2 border-b border-gray-300 font-bold">
                Today&apos;s Goal
              </th>
            </tr>
          </thead>
          <tbody>
            {data.entries?.map((item, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-4 py-2 border-b border-gray-200">
                  {item.date}
                </td>
                <td className="px-4 py-2 border-b border-gray-200">
                  {formatSeconds(item.totalSeconds)}
                </td>
                <td className="px-4 py-2 border-b border-gray-200">
                  {item.dailyHourGoal.toFixed(1)} hrs
                </td>
              </tr>
            ))}
            {(!data?.entries || data?.entries.length === 0) && (
              <tr>
                <td colSpan={3} className="text-center py-5">
                  데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
};
