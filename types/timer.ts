import { RecordData } from "./record";

export type PostTimeReq = {
  startAt: string; // ISO 8601 string (UTC)
  endAt: string;
};

export type GetMonthTimeRes = {
  entries: RecordData[];
  monthlyTotal: number;
};

export type GetTodayTimeRes = {
  dailyHourGoal: number;
  date: string;
  goalInSeconds: number;
  id: number;
  totalSeconds: number;
  userId: string;
};

export type GetTimerGoalRes = {
  hour: number;
};

export type PostTimeGoalReq = {
  hour: number;
};
