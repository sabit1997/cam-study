import request from "@/apis/request";
import { AxiosMethod } from "@/types/axios";
import type { AiAction } from "@/types/ai-actions";
import { AiEndPoints } from "../config";

export interface InterpretResponse {
  actions: AiAction[];
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
}
