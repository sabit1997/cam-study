import AiServiceRemote from "./service.remote";

// 타입과 순수 SSE 파서(findEventBoundary/handleSseEvent)는 remote 쪽에서 그대로
// 재수출한다. 지금까지 `./service`에서 이 심볼들을 꺼내 쓰던 훅/테스트 코드가
// 그대로 동작한다.
export * from "./service.remote";

export default AiServiceRemote;
