"use client";

import { RecordData } from "@/types/record";
import { formatSeconds } from "@/utils/formatSeconds";
import { useState } from "react";
import { IoChevronDownOutline } from "react-icons/io5";
import { IoChevronUp } from "react-icons/io5";

const data: RecordData[] = [
  // mock data
  {
    id: 1,
    userId: "user@example.com",
    date: "2025-05-01",
    totalSeconds: 3600,
    dailyHourGoal: 2.0,
  },
  {
    id: 2,
    userId: "user@example.com",
    date: "2025-05-02",
    totalSeconds: 5400,
    dailyHourGoal: 2.5,
  },
];

export const RecordSection = () => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const handleYearChange = (diff: number) => {
    const newYear = year + diff;
    const isTooOld = newYear < currentYear - 2;
    const isInFuture =
      newYear > currentYear ||
      (newYear === currentYear && month > currentMonth);
    if (!isTooOld && !isInFuture) {
      setYear(newYear);
    }
  };

  const handleMonthChange = (diff: number) => {
    let newMonth = month + diff;
    let newYear = year;

    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }

    const isTooOld = newYear < currentYear - 2;
    const isInFuture =
      newYear > currentYear ||
      (newYear === currentYear && newMonth > currentMonth);

    if (!isTooOld && !isInFuture) {
      setYear(newYear);
      setMonth(newMonth);
    }
  };

  return (
    <div className="pt-8">
      <div className="flex items-center gap-4 mb-4 text-xl">
        <div className="flex items-center gap-2">
          <button onClick={() => handleYearChange(-1)}>
            <IoChevronDownOutline />
          </button>
          <p>year : </p>
          <span className="text-[#255f38]">{year}</span>
          <button onClick={() => handleYearChange(1)}>
            <IoChevronUp />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => handleMonthChange(-1)}>
            <IoChevronDownOutline />
          </button>
          <p>month : </p>
          <span className="text-[#255f38]">{month}</span>
          <button onClick={() => handleMonthChange(1)}>
            <IoChevronUp />
          </button>
        </div>
      </div>

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
            {data.map((item, idx) => (
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
          </tbody>
        </table>
      </section>
    </div>
  );
};
