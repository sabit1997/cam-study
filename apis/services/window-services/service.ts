import { IS_LOCAL_MODE } from "@/utils/app-mode";
import WindowServiceRemote from "./service.remote";
import WindowServiceLocal from "./service.local";

// 로컬 모드 스위처. IS_LOCAL_MODE는 빌드타임 상수라 반대 모드 구현은
// 최종 번들에서 tree-shake 된다.
const WindowService = IS_LOCAL_MODE ? WindowServiceLocal : WindowServiceRemote;

export default WindowService;
