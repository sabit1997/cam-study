import { RecordData } from "./record";

export type PostTimeReq = {
  startAt: string; // ISO 8601 string (UTC)
  endAt: string;
};

export type GetMonthTimeRes = {
  entries: RecordData[];
  monthlyTotal: 9000;
};

export type GetTodayTimeRes = {
  id: number;
  userId: string;
  date: string;
  totalSeconds: number;
  dailyHourGoal: number;
};

export type GetTimerGoalRes = {
  hour: number;
};

export type PostTimeGoalReq = {
  hour: number;
};
