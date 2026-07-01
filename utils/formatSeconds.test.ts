import { describe, it, expect } from "vitest";
import { formatSeconds } from "./formatSeconds";

describe("formatSeconds", () => {
  it("0초는 00:00:00", () => {
    expect(formatSeconds(0)).toBe("00:00:00");
  });

  it("59초", () => {
    expect(formatSeconds(59)).toBe("00:00:59");
  });

  it("1분 = 60초", () => {
    expect(formatSeconds(60)).toBe("00:01:00");
  });

  it("1시간 = 3600초", () => {
    expect(formatSeconds(3600)).toBe("01:00:00");
  });

  it("1시간 30분 45초", () => {
    expect(formatSeconds(5445)).toBe("01:30:45");
  });

  it("10시간 이상도 패딩 유지", () => {
    expect(formatSeconds(36000)).toBe("10:00:00");
  });

  it("각 자리 두 자리 패딩 적용", () => {
    expect(formatSeconds(3661)).toBe("01:01:01");
  });
});
