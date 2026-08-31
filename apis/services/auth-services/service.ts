import { IS_LOCAL_MODE } from "@/utils/app-mode";
import AuthServiceRemote from "./service.remote";
import AuthServiceLocal from "./service.local";

// 로컬 모드 스위처. 로컬 구현은 즉시 성공하는 no-op이고,
// 실제 호출은 App.tsx 가드로 이미 차단돼 있다.
const AuthService = IS_LOCAL_MODE ? AuthServiceLocal : AuthServiceRemote;

export default AuthService;
