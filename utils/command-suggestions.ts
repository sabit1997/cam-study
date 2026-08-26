/**
 * 팔레트를 열었을 때 보여줄 예시 명령.
 *
 * 빈 입력창만 띄워놓으면 사용자는 무엇을 칠 수 있는지 알 수 없다.
 * 예시는 발견 가능성을 주는 동시에, 화살표로 훑을 수 있는 실제 목록이 되어
 * 팔레트가 표준 combobox 패턴을 따를 근거가 된다.
 *
 * 규칙: 여기 있는 문장은 **전부 끝까지 동작해야 한다.** 처음 팔레트를 연 사용자가
 * 가장 먼저 눌러보는 항목이라, 하나라도 실패하면 기능 전체를 신뢰하지 않게 된다.
 * 그래서 예시를 늘릴 때는 utils/ai-fallback.ts에 사전 녹화 응답을 함께 넣고,
 * 그 액션이 전부 supported인지 테스트로 잠근다(utils/ai-fallback.test.ts).
 */
export const COMMAND_SUGGESTIONS = [
  "코딩테스트 공부 세션 만들어줘",
  "React 공부 할 일 3개 만들어줘",
  "45분 집중 15분 휴식 포모도로 시작해줘",
  "할 일 목록 창 열어줘",
  "타이머 창 열어줘",
  "유튜브 창 열어줘",
] as const;

export const filterSuggestions = (query: string): string[] => {
  const trimmed = query.trim();
  if (!trimmed) return [...COMMAND_SUGGESTIONS];
  const lowered = trimmed.toLowerCase();
  return COMMAND_SUGGESTIONS.filter((item) =>
    item.toLowerCase().includes(lowered)
  );
};
