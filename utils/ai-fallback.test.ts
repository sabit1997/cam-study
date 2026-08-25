import { describe, expect, it } from "vitest";
import { validateAiActions } from "@/utils/ai-action-validate";
import { COMMAND_SUGGESTIONS } from "@/utils/command-suggestions";
import { getFallbackActions, isFallbackAvailable } from "@/utils/ai-fallback";

describe("ai-fallback", () => {
  it("예시 다섯 개 전부에 fallback이 있다", () => {
    for (const suggestion of COMMAND_SUGGESTIONS) {
      expect(isFallbackAvailable(suggestion)).toBe(true);
      expect(getFallbackActions(suggestion)).not.toBeNull();
    }
  });

  it("모든 fallback 액션이 2단계 검증을 통과한다 — 그렇지 않으면 실행 지점에서 거절된다", () => {
    for (const suggestion of COMMAND_SUGGESTIONS) {
      const actions = getFallbackActions(suggestion);
      expect(actions).not.toBeNull();
      const validation = validateAiActions(actions!);
      expect(validation.ok).toBe(true);
      if (validation.ok) expect(validation.actions.length).toBeGreaterThan(0);
    }
  });

  it("정확 일치만 통과 — 유사도 매칭은 하지 않는다", () => {
    expect(isFallbackAvailable("타이머 창 열어줘")).toBe(true);
    expect(isFallbackAvailable("타이머 열어줘")).toBe(false);
    expect(isFallbackAvailable("커피 만들어줘")).toBe(false);
  });

  it("앞뒤 공백은 무시한다", () => {
    expect(isFallbackAvailable("  타이머 창 열어줘  ")).toBe(true);
    expect(getFallbackActions("  유튜브 창 열어줘\n")).not.toBeNull();
  });
});
