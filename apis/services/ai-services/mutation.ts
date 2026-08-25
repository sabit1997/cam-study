import { useMutation } from "@tanstack/react-query";
import AiService, { type InterpretResponse } from "./service";

/**
 * 명령 해석은 캐시할 것이 없어서 query가 아니라 mutation이다.
 * 같은 문장이라도 매번 새로 해석하는 게 맞다.
 */
export const useInterpretCommand = () => {
  // TError가 unknown인 이유: apis/request.ts는 Error 인스턴스가 아니라
  // 평면 객체 { message, code, response }를 reject한다. Error로 적어두면
  // 타입은 통과하지만 런타임에 맞지 않는다. 메시지 추출은 utils/api-error.ts가 한다.
  return useMutation<InterpretResponse, unknown, string>({
    mutationFn: (text) => AiService.interpret(text),
    meta: {
      ERROR_SOURCE: "[명령 해석 실패]",
    },
  });
};
