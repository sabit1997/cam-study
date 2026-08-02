import { describe, expect, it } from "vitest";
import { timerQueryKeys } from "./query";

describe("timerQueryKeys", () => {
  it("keeps monthly records and analytics in separate caches", () => {
    expect(timerQueryKeys.month(2026, 8)).not.toEqual(
      timerQueryKeys.analytics(2026, 8)
    );
  });
});
