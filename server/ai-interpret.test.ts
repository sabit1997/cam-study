import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
import {
  DEFAULT_MODEL,
  MAX_INPUT_LENGTH,
  interpret,
  isPurpose,
  type GenerateResult,
} from "./ai-interpret";

const replying = (text: string, extra: Partial<GenerateResult> = {}) =>
  vi.fn().mockResolvedValue({ text, ...extra } satisfies GenerateResult);

const finishing = (finishReason: string) =>
  vi.fn().mockResolvedValue({ text: "", candidates: [{ finishReason }] });

describe("interpret", () => {
  it("모델이 준 액션 배열을 돌려준다", async () => {
    const generateContent = replying(
      JSON.stringify({
        actions: [
          { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
          { type: "ADD_TODO", ref: "t1", text: "캐싱 실습" },
        ],
      })
    );

    const result = await interpret("코테 공부 세션 만들어줘", { generateContent });

    expect(result).toEqual({
      ok: true,
      actions: [
        { type: "CREATE_WINDOW", widget: "todo", ref: "t1" },
        { type: "ADD_TODO", ref: "t1", text: "캐싱 실습" },
      ],
    });
  });

  it("빈 배열도 정상 응답이다 — 확신이 없으면 아무것도 하지 않는다", async () => {
    const result = await interpret("오늘 날씨 어때?", {
      generateContent: replying(JSON.stringify({ actions: [] })),
    });
    expect(result).toEqual({ ok: true, actions: [] });
  });

  it("구조화 출력을 켜서 호출한다", async () => {
    const generateContent = replying(JSON.stringify({ actions: [] }));
    await interpret("타이머 켜줘", { generateContent });

    const params = generateContent.mock.calls[0][0];
    expect(params.model).toBe(DEFAULT_MODEL);
    // 상대 날짜 해석을 위해 오늘 날짜를 앞머리에 주입한다.
    expect(params.contents).toMatch(/^\[오늘: \d{4}-\d{2}-\d{2}\]\n타이머 켜줘$/);
    expect(params.config.responseMimeType).toBe("application/json");
    expect(params.config.systemInstruction).toContain("CamStudy");
    // 명령 해석은 짧은 구조 변환이라 깊게 생각시키지 않는다 (지연이 곧 체감 품질)
    expect(params.config.thinkingConfig).toEqual({ thinkingLevel: "MINIMAL" });
    // 액션 정의에서 파생된 스키마가 실제로 실려 나가는지
    expect(JSON.stringify(params.config.responseJsonSchema)).toContain("START_POMODORO");
  });

  it("모델을 환경변수/옵션으로 바꿀 수 있다", async () => {
    const generateContent = replying(JSON.stringify({ actions: [] }));
    await interpret("x", { generateContent, model: "gemini-3-pro" });
    expect(generateContent.mock.calls[0][0].model).toBe("gemini-3-pro");
  });

  describe("purpose별 thinkingLevel 분기", () => {
    it("purpose를 안 주면 기본 command로 MINIMAL을 쓴다", async () => {
      const generateContent = replying(JSON.stringify({ actions: [] }));
      await interpret("x", { generateContent });
      expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({
        thinkingLevel: "MINIMAL",
      });
    });

    it("record-query는 MINIMAL — 짧은 구조 변환이라 깊게 생각시킬 이유가 없다", async () => {
      const generateContent = replying(JSON.stringify({ actions: [] }));
      await interpret("x", { generateContent, purpose: "record-query" });
      expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({
        thinkingLevel: "MINIMAL",
      });
    });

    it("label-suggest도 MINIMAL — 앱 이름 분류는 단순 태스크다", async () => {
      const generateContent = replying(JSON.stringify({ actions: [] }));
      await interpret("x", { generateContent, purpose: "label-suggest" });
      expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({
        thinkingLevel: "MINIMAL",
      });
    });

    it("youtube-search는 MEDIUM — 다단계 도구 사용이라 MINIMAL은 조기 종료 위험이 있다", async () => {
      const generateContent = replying(JSON.stringify({ actions: [] }));
      await interpret("x", { generateContent, purpose: "youtube-search" });
      expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({
        thinkingLevel: "MEDIUM",
      });
    });

    it("video-analyze는 MEDIUM — 영상 파싱은 목차와 근거를 함께 뽑아야 한다", async () => {
      const generateContent = replying(JSON.stringify({ actions: [] }));
      await interpret("x", { generateContent, purpose: "video-analyze" });
      expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({
        thinkingLevel: "MEDIUM",
      });
    });
  });

  describe("isPurpose", () => {
    it("정의된 값만 true", () => {
      expect(isPurpose("command")).toBe(true);
      expect(isPurpose("record-query")).toBe(true);
      expect(isPurpose("label-suggest")).toBe(true);
      expect(isPurpose("youtube-search")).toBe(true);
      expect(isPurpose("video-analyze")).toBe(true);
    });

    it("그 밖의 값은 false — API 어댑터에서 화이트리스트 필터로 쓴다", () => {
      expect(isPurpose("")).toBe(false);
      expect(isPurpose("COMMAND")).toBe(false);
      expect(isPurpose("admin")).toBe(false);
      expect(isPurpose(null)).toBe(false);
      expect(isPurpose(undefined)).toBe(false);
      expect(isPurpose(42)).toBe(false);
    });
  });

  describe("입력 가드", () => {
    it("빈 명령을 거부한다", async () => {
      const generateContent = replying("{}");
      expect(await interpret("   ", { generateContent })).toMatchObject({ status: 400 });
      expect(await interpret(undefined, { generateContent })).toMatchObject({ status: 400 });
      expect(generateContent).not.toHaveBeenCalled();
    });

    it("지나치게 긴 명령을 거부한다 — 호출 전에 막는다", async () => {
      const generateContent = replying("{}");
      const result = await interpret("가".repeat(MAX_INPUT_LENGTH + 1), { generateContent });
      expect(result).toMatchObject({ status: 400 });
      expect(generateContent).not.toHaveBeenCalled();
    });
  });

  describe("모델 응답이 기대와 다를 때", () => {
    it("프롬프트가 차단되면 본문을 읽지 않고 422", async () => {
      const generateContent = vi
        .fn()
        .mockResolvedValue({ promptFeedback: { blockReason: "SAFETY" } });
      expect(await interpret("나쁜 요청", { generateContent })).toMatchObject({
        ok: false,
        status: 422,
      });
    });

    it("안전 필터로 끊기면 422", async () => {
      expect(await interpret("x", { generateContent: finishing("SAFETY") })).toMatchObject({
        ok: false,
        status: 422,
      });
    });

    it("토큰 한도로 끊기면 502", async () => {
      expect(
        await interpret("x", { generateContent: finishing("MAX_TOKENS") })
      ).toMatchObject({ ok: false, status: 502 });
    });

    it("JSON이 아니면 502", async () => {
      const result = await interpret("x", { generateContent: replying("설명하자면...") });
      expect(result).toMatchObject({ ok: false, status: 502 });
    });

    it("스키마를 벗어난 액션은 통과시키지 않는다", async () => {
      // 스키마를 강제해도 코드 쪽에서 다시 확인하는 이유.
      const result = await interpret("카메라 켜줘", {
        generateContent: replying(
          JSON.stringify({ actions: [{ type: "CREATE_WINDOW", widget: "camera" }] })
        ),
      });
      expect(result).toMatchObject({ ok: false, status: 502 });
    });

    it("빈 응답이면 502", async () => {
      const result = await interpret("x", { generateContent: replying("") });
      expect(result).toMatchObject({ ok: false, status: 502 });
    });
  });

  describe("API 오류 매핑", () => {
    const apiError = (status: number) =>
      vi.fn().mockRejectedValue(new ApiError({ message: "boom", status }));

    it("레이트 리밋은 429로 넘긴다 — 무료 티어에서 자주 만난다", async () => {
      expect(await interpret("x", { generateContent: apiError(429) })).toMatchObject({
        ok: false,
        status: 429,
      });
    });

    it("잘못된 키는 설정 문제로 알려준다", async () => {
      const result = await interpret("x", { generateContent: apiError(403) });
      expect(result).toMatchObject({ ok: false, status: 500 });
      if (!result.ok) expect(result.error).toContain("키");
    });

    it("그 밖의 API 오류는 502", async () => {
      expect(await interpret("x", { generateContent: apiError(500) })).toMatchObject({
        ok: false,
        status: 502,
      });
    });

    it("503은 한 번 재시도한다 — 일시적 과부하는 대개 다시 하면 통과한다", async () => {
      const generateContent = vi
        .fn()
        .mockRejectedValueOnce(new ApiError({ message: "busy", status: 503 }))
        .mockResolvedValueOnce({ text: JSON.stringify({ actions: [] }) });

      const result = await interpret("x", { generateContent });

      expect(generateContent).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true, actions: [] });
    });

    it("재시도해도 503이면 503으로 알려준다 — 무한 재시도하지 않는다", async () => {
      const generateContent = apiError(503);
      const result = await interpret("x", { generateContent });

      expect(generateContent).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ ok: false, status: 503 });
      if (!result.ok) expect(result.error).toContain("혼잡");
    });

    it("429는 재시도하지 않는다 — 할당량 초과에 다시 던지면 더 나빠진다", async () => {
      const generateContent = apiError(429);
      await interpret("x", { generateContent });
      expect(generateContent).toHaveBeenCalledTimes(1);
    });

    it("알 수 없는 오류는 500", async () => {
      const result = await interpret("x", {
        generateContent: vi.fn().mockRejectedValue(new Error("boom")),
      });
      expect(result).toMatchObject({ ok: false, status: 500 });
    });
  });
});
