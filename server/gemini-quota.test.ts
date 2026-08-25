import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
import { parseGeminiQuotaError, quotaMessage } from "./gemini-quota";

/**
 * SDK v2.x는 응답 바디를 `JSON.stringify` 그대로 message에 넣는다.
 * 즉 message는 처음부터 `{`로 시작하는 순수 JSON.
 */
const buildError = (bodyJson: object): ApiError =>
  new ApiError({ message: JSON.stringify(bodyJson), status: 429 });

const quotaBody = (quotaId: string, retryDelay?: string) => ({
  error: {
    code: 429,
    message: "Resource has been exhausted (e.g. check quota).",
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId }],
      },
      ...(retryDelay
        ? [
            {
              "@type": "type.googleapis.com/google.rpc.RetryInfo",
              retryDelay,
            },
          ]
        : []),
    ],
  },
});

describe("parseGeminiQuotaError", () => {
  it("일일 한도 소진은 daily로 분류", () => {
    const err = buildError(
      quotaBody("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "36000s")
    );
    const info = parseGeminiQuotaError(err);
    expect(info.kind).toBe("daily");
    expect(info.retryAfterSec).toBe(36000);
  });

  it("분당 한도 소진은 minute으로 분류", () => {
    const err = buildError(
      quotaBody("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "39s")
    );
    const info = parseGeminiQuotaError(err);
    expect(info.kind).toBe("minute");
    expect(info.retryAfterSec).toBe(39);
  });

  it("retryDelay가 없어도 kind은 그대로", () => {
    const err = buildError(
      quotaBody("GenerateRequestsPerDayPerProjectPerModel-FreeTier")
    );
    expect(parseGeminiQuotaError(err)).toEqual({ kind: "daily" });
  });

  it("details가 없어도 error.message 텍스트에 'per day'가 있으면 daily", () => {
    // 무료 티어 그라운딩 검색에서 실제로 이런 응답을 자주 만난다.
    const err = buildError({
      error: {
        code: 429,
        message:
          "You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generate_content_free_tier_input_token_count, limit: 250000 per day.",
        status: "RESOURCE_EXHAUSTED",
      },
    });
    expect(parseGeminiQuotaError(err).kind).toBe("daily");
  });

  it("details가 없어도 error.message 텍스트에 'per minute'가 있으면 minute", () => {
    const err = buildError({
      error: {
        code: 429,
        message: "Rate limit exceeded: 10 requests per minute for this model.",
        status: "RESOURCE_EXHAUSTED",
      },
    });
    expect(parseGeminiQuotaError(err).kind).toBe("minute");
  });

  it("QuotaFailure는 있는데 quotaId 대신 quotaMetric에 힌트가 있는 경우", () => {
    const err = buildError({
      error: {
        code: 429,
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [
              {
                quotaMetric:
                  "generativelanguage.googleapis.com/generate_content_free_tier_requests_per_minute",
              },
            ],
          },
        ],
      },
    });
    expect(parseGeminiQuotaError(err).kind).toBe("minute");
  });

  it("message가 JSON이 아니어도 힌트 텍스트로 분류", () => {
    // SDK 이전 버전이나 미들박스가 message를 조작한 경우 대비 fallback.
    const err = new ApiError({
      message:
        "got status: RESOURCE_EXHAUSTED. Reason: GenerateRequestsPerMinute-FreeTier exceeded",
      status: 429,
    });
    expect(parseGeminiQuotaError(err).kind).toBe("minute");
  });

  it("429가 아닌 오류는 unknown", () => {
    const err = new ApiError({ message: "server error", status: 500 });
    expect(parseGeminiQuotaError(err).kind).toBe("unknown");
  });

  it("ApiError가 아닌 오류(네트워크 등)는 unknown", () => {
    expect(parseGeminiQuotaError(new Error("boom")).kind).toBe("unknown");
    expect(parseGeminiQuotaError(null).kind).toBe("unknown");
    expect(parseGeminiQuotaError(undefined).kind).toBe("unknown");
  });

  it("힌트가 전혀 없으면 unknown이지만 원본을 서버 로그에 남긴다", () => {
    // 다음 사용자가 같은 상황을 겪을 때 진단할 수 있어야 한다.
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = new ApiError({
      message: JSON.stringify({
        error: {
          code: 429,
          message: "Unrecognized quota exhaustion",
          status: "RESOURCE_EXHAUSTED",
        },
      }),
      status: 429,
    });
    expect(parseGeminiQuotaError(err).kind).toBe("unknown");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("분류 불가"),
      expect.any(String)
    );
    spy.mockRestore();
  });
});

describe("quotaMessage", () => {
  it("daily는 '내일 다시'를 안내한다 — '잠시 후'가 오해를 부른다", () => {
    const msg = quotaMessage({ kind: "daily" });
    expect(msg).toContain("내일");
    expect(msg).not.toContain("잠시 후");
  });

  it("minute은 실제 재시도 시간을 넣는다", () => {
    const msg = quotaMessage({ kind: "minute", retryAfterSec: 45 });
    expect(msg).toContain("45");
  });

  it("minute이라도 시간 정보가 없으면 '잠시 후'로 폴백", () => {
    expect(quotaMessage({ kind: "minute" })).toContain("잠시 후");
  });

  it("server는 우리 서버 IP 레이트리밋용 문구", () => {
    expect(quotaMessage({ kind: "server" })).toContain("요청이 너무 많아요");
  });

  it("unknown은 기본 안내", () => {
    expect(quotaMessage({ kind: "unknown" })).toContain("잠시 후");
  });
});
