import { IS_LOCAL_MODE } from "@/utils/app-mode";
import TimerServiceRemote from "./service.remote";
import TimerServiceLocal from "./service.local";

// 로컬 모드 스위처. 반대 모드 구현은 tree-shake 대상.
const TimerService = IS_LOCAL_MODE ? TimerServiceLocal : TimerServiceRemote;

export default TimerService;
