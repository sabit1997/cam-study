import { describe, expect, it } from "vitest";
import { validateAiActions } from "@/utils/ai-action-validate";
import { COMMAND_SUGGESTIONS } from "@/utils/command-suggestions";
import { getFallbackActions, isFallbackAvailable } from "@/utils/ai-fallback";
import { describeAiActions } from "@/utils/ai-action-describe";

describe("ai-fallback", () => {
  it("예시 전부에 fallback이 있다", () => {
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

  it("모든 fallback 액션이 실행기가 처리할 수 있는 것이다", () => {
    // 예시는 처음 팔레트를 연 사용자가 가장 먼저 눌러보는 항목이다.
    // 하나라도 "아직 지원 안 됨"이면 기능 전체를 신뢰하지 않게 된다.
    for (const suggestion of COMMAND_SUGGESTIONS) {
      const described = describeAiActions(getFallbackActions(suggestion)!);
      for (const item of described) {
        expect(item.supported, `${suggestion}: ${item.text}`).toBe(true);
      }
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
