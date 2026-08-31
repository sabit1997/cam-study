import request from "@/apis/request";
import { AxiosMethod } from "@/types/axios";
import type { AiAction } from "@/types/ai-actions";
import { AiEndPoints } from "../config";

/**
 * 온보딩 채팅 전용 타입.
 * 다른 AI 요청과 달리 SSE 스트림이라 axios 인스턴스를 재사용하지 않고
 * fetch로 직접 호출한다. request.ts의 401 자동 refresh는 이 엔드포인트에서
 * 필요하지 않다 — 모달이 RequireAuth 안쪽 홈 화면에서, 그것도 방금 로그인해
 * 창 목록까지 받아온 뒤에만 열리므로 세션은 이미 살아 있다.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * 온보딩이 만들 수 있는 창. camera 창은 로컬 웹캠 스트림이라 AI가 생성하지 않고
 * 사용자가 홈 화면에서 직접 켠다 — types/ai-actions.ts의 AI_WIDGETS와 같은 축이다.
 */
export interface OnboardingWindowSpec {
  widget: "youtube" | "window" | "todo" | "timer";
  ref?: string;
  todos?: string[];
}

export type OnboardingReply =
  | { phase: "ask" }
  | { phase: "done"; windows: OnboardingWindowSpec[] };

export interface OnboardingChatCallbacks {
  onDelta: (text: string) => void;
  onDone: (result: { reply: OnboardingReply | null; visibleText: string }) => void;
  onError: (err: {
    status?: number;
    error: string;
    reason?: "daily" | "minute" | "server" | "unknown";
    retryAfterSec?: number;
  }) => void;
  signal?: AbortSignal;
}

export interface InterpretResponse {
  actions: AiAction[];
}

export interface YoutubeSearchRequest {
  query: string;
  count?: number;
}

export interface YoutubeSearchCandidate {
  videoId: string;
  title: string;
  channel: string;
}

export interface YoutubeSearchResponse {
  candidates: YoutubeSearchCandidate[];
}

/**
 * 서버가 인식하는 목적 값. 서버(server/ai-interpret.ts)의 Purpose와 일치해야 한다.
 * 클라이언트 quota 가중치도 여기에 맞춰 정의된다(utils/ai-quota.ts).
 */
export type AiPurpose =
  | "command"
  | "record-query"
  | "label-suggest"
  | "youtube-search"
  | "video-analyze";

export interface InterpretRequest {
  text: string;
  purpose?: AiPurpose;
}

export default class AiService {
  /**
   * 자연어 명령을 액션 배열로 바꾼다.
   *
   * 돌아온 액션은 아직 신뢰할 수 없는 값이다. 실행 직전에 AiActionRunner가
   * utils/ai-action-validate로 다시 검증한다.
   *
   * `purpose`는 서버 thinkingLevel과 클라이언트 quota 가중치의 분기 축이다.
   * 기본값은 "command"라 값이 없으면 그대로 명령 해석으로 취급된다.
   */
  public static readonly interpret = (
    payload: InterpretRequest | string
  ): Promise<InterpretResponse> => {
    const body: InterpretRequest =
      typeof payload === "string" ? { text: payload } : payload;
    return request<InterpretResponse>({
      url: AiEndPoints.interpret(),
      method: AxiosMethod.POST,
      data: body,
    });
  };

  /**
   * Gemini 그라운딩 검색으로 유튜브 강의 후보를 찾는다.
   *
   * 반환된 videoId는 서버가 이미 정규식으로 검증했지만, 팔레트는 승인 전에
   * 임베드 가능 여부까지 다시 확인한다(utils/youtube-pipeline.ts). LLM이 지어낸
   * 존재하지 않는 videoId는 임베드 검사에서 걸린다.
   */
  public static readonly youtubeSearch = (
    payload: YoutubeSearchRequest
  ): Promise<YoutubeSearchResponse> => {
    return request<YoutubeSearchResponse>({
      url: AiEndPoints.youtubeSearch(),
      method: AxiosMethod.POST,
      data: payload,
    });
  };

  /**
   * 온보딩 대화 SSE 스트림을 열고 chunk마다 콜백을 호출한다.
   *
   * ## 왜 fetch인가
   * axios는 XHR 기반으로 응답 전체를 버퍼링해 실시간 SSE에 부적합하다. fetch는
   * response.body가 ReadableStream이라 chunks를 즉시 읽을 수 있다.
   *
   * ## 반환
   * 스트림 종료(완료·오류·중단) 시 resolve하는 Promise. 값은 없다 — 결과는
   * onDone·onError 콜백으로 전달된다.
   */
  public static readonly onboardingChatStream = async (
    messages: ChatMessage[],
    callbacks: OnboardingChatCallbacks
  ): Promise<void> => {
    const response = await fetch(`/api${AiEndPoints.onboardingChat()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ messages }),
      credentials: "include",
      signal: callbacks.signal,
    });

    if (!response.ok) {
      // SSE로 열리지 않았다 — 게이트에서 걸린 것.
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // ignore — body가 없거나 JSON이 아니면 status로 안내
      }
      const record = (body ?? {}) as Record<string, unknown>;
      const status = response.status;
      const rawReason =
        typeof record.reason === "string" ? (record.reason as string) : undefined;
      const reason:
        | "daily"
        | "minute"
        | "server"
        | "unknown"
        | undefined =
        rawReason === "daily" ||
        rawReason === "minute" ||
        rawReason === "server" ||
        rawReason === "unknown"
          ? rawReason
          : undefined;
      const retryAfterSec =
        typeof record.retryAfterSec === "number" ? record.retryAfterSec : undefined;
      callbacks.onError({
        status,
        error:
          typeof record.error === "string" && record.error.trim().length > 0
            ? record.error
            : `요청이 실패했어요 (${status}).`,
        ...(reason !== undefined ? { reason } : {}),
        ...(retryAfterSec !== undefined ? { retryAfterSec } : {}),
      });
      return;
    }

    if (!response.body) {
      callbacks.onError({ status: 502, error: "AI 응답 스트림을 열지 못했어요." });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 이벤트는 빈 줄로 구분된다. RFC상 라인 끝은 \n·\r\n·\r 모두 허용이라
        // 이벤트 경계도 세 조합을 모두 잡아야 한다. Vercel edge·일부 CDN이 CRLF로
        // 내려주는 사례가 있어서, LF만 검사하면 이벤트가 영영 파싱되지 않고 buffer만
        // 무한히 커진다.
        let boundary = findEventBoundary(buffer);
        while (boundary) {
          const rawEvent = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary.length);
          handleSseEvent(rawEvent, callbacks);
          boundary = findEventBoundary(buffer);
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      callbacks.onError({
        status: 500,
        error: "AI 응답 스트림이 중간에 끊겼어요.",
      });
    } finally {
      // reader를 잡고 있으면 body가 GC되지 않는다. 정상 종료·에러·abort 모두에서 해제.
      try {
        reader.releaseLock();
      } catch {
        // 이미 해제됐거나 취소된 경우는 무시
      }
    }
  };
}

/**
 * buffer에서 가장 먼저 나타나는 SSE 이벤트 경계를 찾는다.
 * SSE 스펙(EventSource): "\n\n" · "\r\r" · "\r\n\r\n" 모두 유효한 경계.
 */
export const findEventBoundary = (
  buffer: string
): { index: number; length: number } | null => {
  let best: { index: number; length: number } | null = null;
  const consider = (idx: number, len: number) => {
    if (idx === -1) return;
    if (best === null || idx < best.index) best = { index: idx, length: len };
  };
  consider(buffer.indexOf("\r\n\r\n"), 4);
  consider(buffer.indexOf("\n\n"), 2);
  consider(buffer.indexOf("\r\r"), 2);
  return best;
};

/**
 * SSE 한 이벤트(빈 줄로 끊긴 덩어리)를 파싱해 콜백을 부른다.
 * data: 로 시작하는 여러 줄이 오면 이어붙여 하나의 JSON으로 취급한다.
 */
export const handleSseEvent = (
  rawEvent: string,
  callbacks: OnboardingChatCallbacks
): void => {
  const dataLines: string[] = [];
  // CRLF·CR·LF 어느 조합이든 라인으로 잘라내고, 각 라인의 trailing \r도 제거한다.
  const lines = rawEvent.split(/\r\n|\n|\r/);
  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return;
  const raw = dataLines.join("\n");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return; // 손상된 이벤트는 조용히 무시
  }
  const record = payload as Record<string, unknown>;
  const type = record.type;
  if (type === "delta" && typeof record.text === "string") {
    callbacks.onDelta(record.text);
  } else if (type === "done") {
    callbacks.onDone({
      reply: (record.reply ?? null) as OnboardingReply | null,
      visibleText:
        typeof record.visibleText === "string" ? record.visibleText : "",
    });
  } else if (type === "error") {
    callbacks.onError({
      status: typeof record.status === "number" ? record.status : 500,
      error:
        typeof record.error === "string"
          ? record.error
          : "AI 요청 처리에 실패했어요.",
      ...(typeof record.reason === "string"
        ? { reason: record.reason as "daily" | "minute" | "server" | "unknown" }
        : {}),
      ...(typeof record.retryAfterSec === "number"
        ? { retryAfterSec: record.retryAfterSec }
        : {}),
    });
  }
};
