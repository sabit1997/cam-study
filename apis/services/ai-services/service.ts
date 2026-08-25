import request from "@/apis/request";
import { AxiosMethod } from "@/types/axios";
import type { AiAction } from "@/types/ai-actions";
import { AiEndPoints } from "../config";

export interface InterpretResponse {
  actions: AiAction[];
}

export default class AiService {
  /**
   * 자연어 명령을 액션 배열로 바꾼다.
   *
   * 돌아온 액션은 아직 신뢰할 수 없는 값이다. 실행 직전에 AiActionRunner가
   * utils/ai-action-validate로 다시 검증한다.
   */
  public static readonly interpret = (text: string): Promise<InterpretResponse> => {
    return request<InterpretResponse>({
      url: AiEndPoints.interpret(),
      method: AxiosMethod.POST,
      data: { text },
    });
  };
}
