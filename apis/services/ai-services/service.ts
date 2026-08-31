import { IS_LOCAL_MODE } from "@/utils/app-mode";
import AiServiceRemote from "./service.remote";
import AiServiceLocal from "./service.local";

// 타입과 순수 SSE 파서(findEventBoundary/handleSseEvent)는 모드와 무관하므로
// remote 쪽에서 그대로 재수출한다. 지금까지 `./service`에서 이 심볼들을 꺼내
// 쓰던 훅/테스트 코드가 그대로 동작한다.
export * from "./service.remote";

// 로컬 모드에서 AI 실행은 UI가 은닉돼 도달하지 않는다. 도달 시엔 throw로 알려준다.
const AiService = IS_LOCAL_MODE ? AiServiceLocal : AiServiceRemote;

export default AiService;
