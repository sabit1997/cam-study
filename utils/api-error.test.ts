import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./api-error";

const FALLBACK = "명령을 해석하지 못했습니다.";

describe("apiErrorMessage", () => {
  it("서버가 준 error 문장을 그대로 쓴다", () => {
    // apis/request.ts가 reject하는 실제 형태
    const rejected = {
      message: "Request failed with status code 429",
      code: "ERR_BAD_REQUEST",
      response: { data: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." } },
    };
    expect(apiErrorMessage(rejected, FALLBACK)).toBe(
      "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
    );
  });

  it("axios의 message는 사용자에게 보여주지 않는다", () => {
    // 네트워크 오류라 response가 없다
    expect(
      apiErrorMessage({ message: "Network Error", code: "ERR_NETWORK" }, FALLBACK)
    ).toBe(FALLBACK);
  });

  it("error가 문자열이 아니면 fallback", () => {
    expect(
      apiErrorMessage({ response: { data: { error: { nested: true } } } }, FALLBACK)
    ).toBe(FALLBACK);
  });

  it("빈 문자열이나 공백은 fallback", () => {
    expect(apiErrorMessage({ response: { data: { error: "   " } } }, FALLBACK)).toBe(
      FALLBACK
    );
  });

  it("HTML 응답처럼 data가 문자열이어도 터지지 않는다", () => {
    expect(
      apiErrorMessage({ response: { data: "<html>502</html>" } }, FALLBACK)
    ).toBe(FALLBACK);
  });

  it("null·undefined·원시값도 안전하게 처리한다", () => {
    expect(apiErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(apiErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(apiErrorMessage("문자열 오류", FALLBACK)).toBe(FALLBACK);
    expect(apiErrorMessage(new Error("boom"), FALLBACK)).toBe(FALLBACK);
  });
});
