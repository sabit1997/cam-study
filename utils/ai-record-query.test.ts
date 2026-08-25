import { afterEach, describe, expect, it, vi } from "vitest";
import TimerService from "@/apis/services/timer-services/service";
import {
  formatCategoryAnswer,
  formatDistractPatternAnswer,
  formatTotalAnswer,
  getByCategory,
  getDistractPattern,
  getTotal,
} from "./ai-record-query";

const mockMonth = (data: {
  year: number;
  month: number;
  entries: Array<{ date: string; totalSeconds: number }>;
}) => ({
  entries: data.entries.map((e, i) => ({
    id: i,
    userId: "u1",
    date: e.date,
    totalSeconds: e.totalSeconds,
    dailyHourGoal: 4,
  })),
  monthlyTotal: data.entries.reduce((s, e) => s + e.totalSeconds, 0),
});

describe("ai-record-query", () => {
  afterEach(() => vi.restoreAllMocks());

  describe("getTotal", () => {
    it("한 달 안의 날짜 범위를 필터링해 합산", async () => {
      const spy = vi
        .spyOn(TimerService, "fetchMonthTime")
        .mockResolvedValue(
          mockMonth({
            year: 2026,
            month: 8,
            entries: [
              { date: "2026-08-01", totalSeconds: 3600 },
              { date: "2026-08-15", totalSeconds: 7200 },
              { date: "2026-08-30", totalSeconds: 1800 },
            ],
          })
        );

      const result = await getTotal("2026-08-10", "2026-08-20");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(2026, 8);
      expect(result.totalSec).toBe(7200); // 8-15만 범위 안
      expect(result.days).toEqual([{ date: "2026-08-15", sec: 7200 }]);
    });

    it("여러 달에 걸친 범위는 각 달을 순회한다", async () => {
      const spy = vi.spyOn(TimerService, "fetchMonthTime").mockImplementation(
        async (year, month) =>
          mockMonth({
            year,
            month,
            entries:
              month === 7
                ? [{ date: "2026-07-30", totalSeconds: 1000 }]
                : month === 8
                  ? [{ date: "2026-08-01", totalSeconds: 2000 }]
                  : [],
          })
      );

      const result = await getTotal("2026-07-01", "2026-09-30");

      // 3개월 조회
      expect(spy).toHaveBeenCalledTimes(3);
      expect(result.totalSec).toBe(3000);
      // 오름차순 정렬
      expect(result.days.map((d) => d.date)).toEqual([
        "2026-07-30",
        "2026-08-01",
      ]);
    });

    it("데이터 없음: totalSec 0, days 빈 배열", async () => {
      vi.spyOn(TimerService, "fetchMonthTime").mockResolvedValue(
        mockMonth({ year: 2026, month: 8, entries: [] })
      );
      const result = await getTotal("2026-08-01", "2026-08-31");
      expect(result.totalSec).toBe(0);
      expect(result.days).toEqual([]);
    });
  });

  describe("getByCategory", () => {
    it("서버 데이터만 있을 때 study에 총합, distract·neutral은 0, incomplete 힌트", async () => {
      vi.spyOn(TimerService, "fetchMonthTime").mockResolvedValue(
        mockMonth({
          year: 2026,
          month: 8,
          entries: [{ date: "2026-08-01", totalSeconds: 3600 }],
        })
      );
      const result = await getByCategory("2026-08-01", "2026-08-31");
      expect(result.study).toBe(3600);
      expect(result.distract).toBe(0);
      expect(result.neutral).toBe(0);
      expect(result.incomplete).toBeTruthy();
    });
  });

  describe("getDistractPattern", () => {
    it("tracker 데이터가 없을 때 incomplete 힌트만 반환", async () => {
      const result = await getDistractPattern("2026-08-01", "2026-08-31", "weekday");
      expect(result.buckets).toEqual([]);
      expect(result.incomplete).toBeTruthy();
    });
  });

  describe("포매터", () => {
    it("formatTotalAnswer: 단일 날짜와 범위 표기가 다르다", () => {
      const single = formatTotalAnswer("2026-08-15", "2026-08-15", {
        totalSec: 3600,
        days: [{ date: "2026-08-15", sec: 3600 }],
      });
      expect(single).toContain("2026-08-15");
      expect(single).toContain("1시간");
      expect(single).not.toContain("부터");

      const range = formatTotalAnswer("2026-08-01", "2026-08-31", {
        totalSec: 10800,
        days: [
          { date: "2026-08-01", sec: 3600 },
          { date: "2026-08-15", sec: 7200 },
        ],
      });
      expect(range).toContain("부터");
      expect(range).toContain("2일");
    });

    it("formatCategoryAnswer: incomplete는 하단에 표기", () => {
      const out = formatCategoryAnswer("2026-08-01", "2026-08-31", {
        study: 3600,
        distract: 0,
        neutral: 0,
        incomplete: "데이터 부족",
      });
      expect(out).toContain("학습");
      expect(out).toContain("데이터 부족");
    });

    it("formatDistractPatternAnswer: incomplete는 안내로만 채운다", () => {
      const out = formatDistractPatternAnswer(
        "2026-08-01",
        "2026-08-31",
        "weekday",
        { buckets: [], incomplete: "데이터 없음" }
      );
      expect(out).toContain("요일별");
      expect(out).toContain("데이터 없음");
    });
  });
});
