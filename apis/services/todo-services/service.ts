import { IS_LOCAL_MODE } from "@/utils/app-mode";
import TodoServiceRemote from "./service.remote";
import TodoServiceLocal from "./service.local";

// 로컬 모드 스위처. 반대 모드 구현은 tree-shake 대상.
const TodoService = IS_LOCAL_MODE ? TodoServiceLocal : TodoServiceRemote;

export default TodoService;
