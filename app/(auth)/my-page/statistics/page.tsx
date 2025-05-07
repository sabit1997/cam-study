import { StatisticsdData } from "@/types/statistics";
import { formatTime } from "@/utils/formatTime";

// mock data
const data: StatisticsdData = {
  achievementRateToday: 75.0,
  weekdayStats: {
    MONDAY: 7200,
    TUESDAY: 3600,
    WEDNESDAY: 1800,
  },
  monthComparison: {
    currentMonthTotal: 12600,
    previousMonthTotal: 10800,
    difference: 1800,
    changeRate: 16.67,
  },
  bestFocusDay: {
    id: 5,
    userId: "user@example.com",
    date: "2025-05-04",
    totalSeconds: 7200,
    dailyHourGoal: 2.0,
  },
};

const StatisticsPage = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      <div className="p-4 border-2 border-[#255f38] rounded-xl bg-[#255f38] shadow-sm">
        <p className="text-sm font-medium text-[#a0c878]">오늘의 목표 달성률</p>
        <div className="text-3xl font-bold text-white">
          {data.achievementRateToday}%
        </div>
      </div>

      <div className="p-4 border-2 border-[#255f38] rounded-xl bg-white shadow-sm">
        <p className="text-xl text-[#255f38] font-bold">월별 비교</p>
        <p className="mt-1">
          이번 달: {formatTime(data.monthComparison.currentMonthTotal)}
        </p>
        <p>지난 달: {formatTime(data.monthComparison.previousMonthTotal)}</p>
        <p
          className={`font-bold ${
            data.monthComparison.difference >= 0
              ? "text-[#A0C878]"
              : "text-[#FFA27F]"
          }`}
        >
          {data.monthComparison.difference >= 0 ? "+" : ""}
          {formatTime(data.monthComparison.difference)} (
          {data.monthComparison.changeRate}%)
        </p>
      </div>

      <div className="p-4 border-2 border-[#255f38] rounded-xl bg-white shadow-sm md:col-span-2">
        <p className="text-xl font-bold mb-2 text-[#255f38]">
          요일별 집중 시간
        </p>
        <ul>
          {Object.entries(data.weekdayStats).map(([day, sec]) => (
            <li key={day} className="text-sm">
              {day[0] + day.slice(1).toLowerCase()}: {formatTime(sec)}
            </li>
          ))}
        </ul>
      </div>

      <div className="p-4 border-2 border-[#255f38] rounded-xl bg-[#FFF085] shadow-sm col-span-1 md:col-span-2 lg:col-span-1">
        <p className="text-xl font-bold text-[#255f38]">최고 집중일</p>
        <p className="font-bold text-lg">{data.bestFocusDay.date}</p>
        <p>집중 시간: {formatTime(data.bestFocusDay.totalSeconds)}</p>
        <p>목표 시간: {data.bestFocusDay.dailyHourGoal}h</p>
      </div>
    </div>
  );
};

export default StatisticsPage;
