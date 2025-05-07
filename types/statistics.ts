export type StatisticsdData = {
  achievementRateToday: number;
  weekdayStats: Record<string, number>;
  monthComparison: monthComparison;
  bestFocusDay: bestFocusDay;
};

type monthComparison = {
  currentMonthTotal: number;
  previousMonthTotal: number;
  difference: number;
  changeRate: number;
};

type bestFocusDay = {
  id: number;
  userId: string;
  date: string;
  totalSeconds: number;
  dailyHourGoal: number;
};
