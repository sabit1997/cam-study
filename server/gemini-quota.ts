import { ApiError } from "@google/genai";

/**
 * Gemini API 429 응답의 세부 정보를 추출한다.
 *
 * ## 왜 필요한가
 * Gemini 무료 티어의 429는 두 가지 상황을 모두 이 코드에 담는다:
 * - 분당 한도(RPM) 초과: 짧게 대기하면 풀린다 (수십 초).
 * - 일일 한도(RPD) 초과: UTC 자정까지 풀리지 않는다.
 *
 * "잠시 후 다시 시도해주세요" 문구는 RPD 소진 사용자에게 오해를 준다.
 *
 * ## SDK v2.x가 실제로 넘기는 형태
 * `throwErrorIfNotOK`가 응답 바디를 `JSON.stringify`해서 `ApiError.message`에 그대로 담는다:
 *   `error.message = JSON.stringify({ error: { code, message, status, details? } })`
 * — 즉 message는 처음부터 `{`로 시작하는 순수 JSON. "got status:" 같은 접두사는 없다.
 *
 * ## 힌트가 있는 위치 (넓은 것부터 좁은 것 순)
 * 1. `error.details[*].violations[*].quotaId` — "PerMinute", "PerDay" 명시적 라벨
 * 2. `error.details[*].retryDelay` (RetryInfo) — "39s" 같은 대기 시간
 * 3. `error.message` 텍스트 — 무료 티어 그라운딩 검색은 details 없이 "per day" 등만 오기도 함
 * 4. message 전체 텍스트 (JSON 파싱 실패 폴백)
 *
 * 어떤 힌트도 못 잡으면 unknown으로 폴백하고, 서버 로그에 원본을 남겨 다음 진단이 가능하게 한다.
 */

export type QuotaExhaustionKind = "daily" | "minute" | "server" | "unknown";

export interface QuotaExhaustionInfo {
  kind: QuotaExhaustionKind;
  /** Retry-After 초 (있으면). daily의 경우 자정까지의 초라 매우 큰 값일 수 있다. */
  retryAfterSec?: number;
}

const parseRetryDelay = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined;
  // Gemini는 "39s" 또는 "39.5s" 형태를 보낸다.
  const match = raw.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return undefined;
  return Math.round(parseFloat(match[1]));
};

/**
 * Gemini의 `ApiError`(status 429)에서 quota 종류와 재시도 시간을 파싱한다.
 * 429가 아니거나 ApiError가 아니면 { kind: "unknown" }.
 */
export const parseGeminiQuotaError = (error: unknown): QuotaExhaustionInfo => {
  if (!(error instanceof ApiError) || error.status !== 429) {
    return { kind: "unknown" };
  }
  const message = error.message ?? "";

  // SDK v2.x는 message에 순수 JSON(`{`부터 시작)을 넣지만, 과거·미래 포맷 대비로
  // 첫 `{` 위치를 찾아 파싱한다.
  const jsonStart = message.indexOf("{");
  let parsed: unknown = null;
  if (jsonStart !== -1) {
    try {
      parsed = JSON.parse(message.slice(jsonStart));
    } catch {
      parsed = null;
    }
  }

  const details = extractDetails(parsed);
  const retryAfterSec = findRetryDelay(details);

  // 1. details의 quotaId (가장 정확)
  let kind = classifyByDetails(details);

  // 2. 파싱된 JSON의 error.message 필드 텍스트 — details 없는 429가 여기 있다
  if (!kind) kind = classifyByKeywords(extractErrorMessage(parsed));

  // 3. ApiError.message 전체 텍스트 (JSON 파싱 실패 폴백)
  if (!kind) kind = classifyByKeywords(message);

  if (!kind) {
    // 원본을 짧게 잘라 로그에 남긴다. 다음 사용자가 겪을 때 진단이 가능하도록.
    // 문구는 사용자에게 노출되지 않는다 — 서버 콘솔에만 남는다.
    console.warn(
      "[gemini-quota] 분류 불가한 429 응답:",
      message.slice(0, 500)
    );
    return { kind: "unknown", ...(retryAfterSec !== undefined ? { retryAfterSec } : {}) };
  }

  return { kind, ...(retryAfterSec !== undefined ? { retryAfterSec } : {}) };
};

const extractDetails = (parsed: unknown): unknown[] => {
  if (!parsed || typeof parsed !== "object") return [];
  const errNode = (parsed as Record<string, unknown>).error;
  if (!errNode || typeof errNode !== "object") return [];
  const details = (errNode as Record<string, unknown>).details;
  return Array.isArray(details) ? details : [];
};

const extractErrorMessage = (parsed: unknown): string => {
  if (!parsed || typeof parsed !== "object") return "";
  const errNode = (parsed as Record<string, unknown>).error;
  if (!errNode || typeof errNode !== "object") return "";
  const msg = (errNode as Record<string, unknown>).message;
  return typeof msg === "string" ? msg : "";
};

const findRetryDelay = (details: unknown[]): number | undefined => {
  for (const d of details) {
    if (!d || typeof d !== "object") continue;
    const record = d as Record<string, unknown>;
    if (record["@type"] && String(record["@type"]).includes("RetryInfo")) {
      const delay = record.retryDelay;
      if (typeof delay === "string") {
        return parseRetryDelay(delay);
      }
    }
  }
  return undefined;
};

const classifyByDetails = (
  details: unknown[]
): QuotaExhaustionKind | null => {
  for (const d of details) {
    if (!d || typeof d !== "object") continue;
    const record = d as Record<string, unknown>;
    const type = record["@type"];
    if (!type || !String(type).includes("QuotaFailure")) continue;
    const violations = record.violations;
    if (!Array.isArray(violations)) continue;
    for (const v of violations) {
      if (!v || typeof v !== "object") continue;
      const record = v as Record<string, unknown>;
      // quotaId·quotaMetric·subject 어디에 실려 오든 문자열이면 훑는다.
      const hay = [record.quotaId, record.quotaMetric, record.subject]
        .filter((x): x is string => typeof x === "string")
        .join(" ");
      const kind = matchQuotaKeyword(hay);
      if (kind) return kind;
    }
  }
  return null;
};

/**
 * 무료 티어 그라운딩 검색은 details 없이 텍스트에만 힌트가 올 때가 많다.
 * quotaId 라벨(PerDay/PerMinute)뿐 아니라 자연어 표현("per day", "daily limit")도 잡는다.
 * 앞서 나온 쪽을 우선 — daily가 minute 안에 부분 문자열로 들어가지 않도록 순서 주의.
 */
// per_day·per day·PerDay 모두 흡수. 이름 안에 언더바가 있는 quotaMetric 값도 잡는다.
const DAILY_PATTERNS = [
  /per[\s_-]*day/i,
  /daily[\s_-]*limit/i,
] as const;

const MINUTE_PATTERNS = [
  /per[\s_-]*minute/i,
] as const;

const matchQuotaKeyword = (hay: string): QuotaExhaustionKind | null => {
  if (!hay) return null;
  for (const p of DAILY_PATTERNS) if (p.test(hay)) return "daily";
  for (const p of MINUTE_PATTERNS) if (p.test(hay)) return "minute";
  return null;
};

const classifyByKeywords = (text: string): QuotaExhaustionKind | null => {
  return matchQuotaKeyword(text ?? "");
};

/**
 * kind별 사용자용 안내 문구.
 * daily는 "잠시 후"가 오해라 자정 대기를 명확히, minute은 실제 재시도 시간을 넣는다.
 */
export const quotaMessage = (info: QuotaExhaustionInfo): string => {
  switch (info.kind) {
    case "daily":
      return "AI 무료 사용량을 오늘 다 썼어요. 내일 다시 시도해 주세요.";
    case "minute":
      if (info.retryAfterSec) {
        return `AI 요청이 순간적으로 몰렸어요. ${info.retryAfterSec}초 후 다시 시도해 주세요.`;
      }
      return "AI 요청이 순간적으로 몰렸어요. 잠시 후 다시 시도해 주세요.";
    case "server":
      // 우리 서버 IP 레이트리밋에서 오는 429. 초 정보는 caller가 별도로 전달.
      return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
    case "unknown":
    default:
      return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
  }
};
