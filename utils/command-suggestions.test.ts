import { describe, expect, it } from "vitest";
import { COMMAND_SUGGESTIONS, filterSuggestions } from "./command-suggestions";

describe("filterSuggestions", () => {
  it("빈 입력에는 전체 예시를 보여준다", () => {
    expect(filterSuggestions("")).toEqual([...COMMAND_SUGGESTIONS]);
    expect(filterSuggestions("   ")).toEqual([...COMMAND_SUGGESTIONS]);
  });

  it("입력에 맞는 예시만 남긴다", () => {
    expect(filterSuggestions("유튜브")).toEqual(["유튜브 창 열어줘"]);
  });

  it("예시는 전부 실행기가 처리할 수 있는 것이어야 한다", () => {
    // 타이머 제어는 아직 연결되지 않았다(ai-action-describe.ts의 UNSUPPORTED_ACTION_TYPES).
    // 예시로 걸어두면 처음 팔레트를 연 사용자가 곧바로 실패를 만난다.
    for (const suggestion of COMMAND_SUGGESTIONS) {
      expect(suggestion).not.toMatch(/스톱워치|포모도로|휴식/);
    }
  });

  it("맞는 예시가 없으면 빈 목록 — 그래도 직접 입력해 실행할 수 있다", () => {
    expect(filterSuggestions("존재하지않는명령zzz")).toEqual([]);
  });
});
