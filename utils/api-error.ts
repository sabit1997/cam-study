/**
 * 실패한 요청에서 "사용자에게 보여줄 수 있는 문장"을 꺼낸다.
 *
 * apis/request.ts는 실패를 Error가 아니라 평면 객체 `{ message, code, response }`로
 * reject한다. 그래서 `error instanceof Error`로 분기하면 항상 false가 되고,
 * 서버가 정성껏 만든 문장("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.")이
 * 통째로 버려진다. 이 함수는 그 경로를 하나로 모은다.
 *
 * axios의 error.message("Request failed with status code 429")는 일부러 쓰지 않는다.
 * 사용자가 읽을 문장이 아니고, 무엇을 해야 하는지도 알려주지 않는다.
 */

interface ErrorBody {
  error?: unknown;
}

const bodyOf = (error: unknown): ErrorBody | null => {
  if (typeof error !== "object" || error === null) return null;
  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return null;
  const data = (response as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  return data as ErrorBody;
};

/**
 * @param fallback 서버 문장을 찾지 못했을 때 보여줄 문장
 */
export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const message = bodyOf(error)?.error;
  return typeof message === "string" && message.trim().length > 0
    ? message
    : fallback;
};
