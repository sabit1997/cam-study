import type {
  ChatMessage,
  OnboardingChatCallbacks,
  YoutubeSearchRequest,
} from "./service.remote";

// 로컬 모드에서 AI 진입점은 UI에서 완전히 은닉된다 (Phase 3.2·3.3).
// 여기 도달하는 호출은 방어적 잔여물이라 즉시 throw해서 실행 경로가
// 조용히 계속되는 일이 없게 한다.

const MSG = "AI 기능은 로컬 모드에서 사용할 수 없습니다.";

function disabled(): never {
  throw new Error(MSG);
}

export default class AiService {
  public static readonly interpret = async (): Promise<never> => disabled();
  public static readonly youtubeSearch = async (
    payload: YoutubeSearchRequest
  ): Promise<never> => {
    void payload;
    return disabled();
  };
  public static readonly onboardingChatStream = async (
    messages: ChatMessage[],
    callbacks: OnboardingChatCallbacks
  ): Promise<void> => {
    void messages;
    callbacks.onError({ status: 501, error: MSG });
  };
}
