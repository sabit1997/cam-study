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

  it("타이머 예시도 검색된다", () => {
    expect(filterSuggestions("포모도로")).toEqual([
      "45분 집중 15분 휴식 포모도로 시작해줘",
    ]);
  });

  it("맞는 예시가 없으면 빈 목록 — 그래도 직접 입력해 실행할 수 있다", () => {
    expect(filterSuggestions("존재하지않는명령zzz")).toEqual([]);
  });
});
