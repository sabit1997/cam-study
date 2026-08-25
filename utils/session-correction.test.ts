import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@/types/tracking";
import { buildChunks, totalDurationSec } from "./session-correction";

const iso = (s: number): string => new Date(s * 1000).toISOString();

const makeSummary = (
  startSec: number,
  endSec: number,
  segments: Array<{ startSec: number; endSec: number; confirmed: boolean }>
): SessionSummary => {
  const startedAt = iso(startSec);
  const endedAt = iso(endSec);
  const confirmedSegs = segments.filter((s) => s.confirmed);
  const distractionSec = confirmedSegs.reduce(
    (sum, s) => sum + (s.endSec - s.startSec),
    0
  );
  return {
    sessionId: "test",
    startedAt,
    endedAt,
    rawDurationSec: endSec - startSec,
    distractionSec,
    correctedDurationSec: endSec - startSec - distractionSec,
    segments: segments.map((s, i) => ({
      id: `s${i}`,
      sessionId: "test",
      appName: "KakaoTalk",
      label: "distract",
      startedAt: iso(s.startSec),
      endedAt: iso(s.endSec),
      durationSec: s.endSec - s.startSec,
      confirmed: s.confirmed,
    })),
  };
};

describe("session-correction", () => {
  describe("keep 모드", () => {
    it("세그먼트가 있어도 원본 한 조각만 반환", () => {
      const summary = makeSummary(0, 3600, [
        { startSec: 1000, endSec: 1400, confirmed: true },
      ]);
      const chunks = buildChunks(summary, "keep");
      expect(chunks).toEqual([
        { startAt: iso(0), endAt: iso(3600) },
      ]);
    });
  });

  describe("exclude 모드", () => {
    it("딴짓이 없으면 원본 한 조각과 동일", () => {
      const summary = makeSummary(0, 3600, []);
      expect(buildChunks(summary, "exclude")).toEqual([
        { startAt: iso(0), endAt: iso(3600) },
      ]);
    });

    it("가운데 세그먼트 하나를 파내 두 조각으로", () => {
      const summary = makeSummary(0, 3600, [
        { startSec: 1000, endSec: 1400, confirmed: true },
      ]);
      const chunks = buildChunks(summary, "exclude");
      expect(chunks).toEqual([
        { startAt: iso(0), endAt: iso(1000) },
        { startAt: iso(1400), endAt: iso(3600) },
      ]);
    });

    it("여러 세그먼트를 시간순으로 처리한다 (입력 순서와 상관없이)", () => {
      const summary = makeSummary(0, 3600, [
        { startSec: 2000, endSec: 2500, confirmed: true },
        { startSec: 500, endSec: 800, confirmed: true },
      ]);
      const chunks = buildChunks(summary, "exclude");
      expect(chunks).toEqual([
        { startAt: iso(0), endAt: iso(500) },
        { startAt: iso(800), endAt: iso(2000) },
        { startAt: iso(2500), endAt: iso(3600) },
      ]);
    });

    it("confirmed=false 세그먼트는 무시 (5분 미달은 딴짓이 아니다)", () => {
      const summary = makeSummary(0, 3600, [
        { startSec: 1000, endSec: 1100, confirmed: false },
      ]);
      expect(buildChunks(summary, "exclude")).toEqual([
        { startAt: iso(0), endAt: iso(3600) },
      ]);
    });

    it("세그먼트가 세션 맨 앞이면 앞 조각을 만들지 않는다", () => {
      const summary = makeSummary(1000, 3600, [
        { startSec: 1000, endSec: 1500, confirmed: true },
      ]);
      expect(buildChunks(summary, "exclude")).toEqual([
        { startAt: iso(1500), endAt: iso(3600) },
      ]);
    });

    it("세그먼트가 세션 맨 끝이면 뒤 조각을 만들지 않는다", () => {
      const summary = makeSummary(0, 3600, [
        { startSec: 3000, endSec: 3600, confirmed: true },
      ]);
      expect(buildChunks(summary, "exclude")).toEqual([
        { startAt: iso(0), endAt: iso(3000) },
      ]);
    });
  });

  describe("정합성 검증 (totalDurationSec)", () => {
    it("exclude 청크 합계가 correctedDurationSec와 같다", () => {
      const summary = makeSummary(0, 3600, [
        { startSec: 500, endSec: 800, confirmed: true },
        { startSec: 2000, endSec: 2500, confirmed: true },
      ]);
      const chunks = buildChunks(summary, "exclude");
      expect(totalDurationSec(chunks)).toBe(summary.correctedDurationSec);
    });

    it("keep 청크 합계는 rawDurationSec와 같다", () => {
      const summary = makeSummary(0, 3600, [
        { startSec: 500, endSec: 800, confirmed: true },
      ]);
      const chunks = buildChunks(summary, "keep");
      expect(totalDurationSec(chunks)).toBe(summary.rawDurationSec);
    });
  });
});
