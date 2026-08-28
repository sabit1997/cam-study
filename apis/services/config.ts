import { TodoQueryParams } from "@/types/todos";

/**
 * 쿼리 문자열을 만든다. 원래 qs.stringify 였다.
 *
 * qs 는 중첩 객체·배열·커스텀 구분자를 지원하는 범용 직렬화기다. 여기서 넘기는 것은
 * 평평한 문자열·불리언 세 개(date·done·order)뿐이라 그 기능이 하나도 쓰이지 않는데,
 * 임계 경로 청크에는 28.3 KB 가 실렸다.
 *
 * URLSearchParams 와 qs 가 갈라지는 지점이 둘 있어서 그대로 옮기면 안 된다.
 * - URLSearchParams 는 공백을 `+` 로, qs 는 `%20` 로 낸다.
 * - undefined 값은 둘 다 생략하지만, URLSearchParams 는 명시적으로 걸러야 한다
 *   (그냥 넣으면 "undefined" 라는 문자열이 된다).
 * 두 동작 모두 apis/services/config.test.ts 가 qs 기준 기대값으로 고정하고 있다.
 */
const stringifyQuery = (params: TodoQueryParams): string => {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    searchParams.set(key, String(value));
  }
  return searchParams.toString().replace(/\+/g, "%20");
};

export const AuthEndPoints = {
  signup: () => `/auth/signup`,
  login: () => `/auth/login`,
  logout: () => `/auth/logout`,
  refresh: () => `/auth/refresh`,
};

export const AiEndPoints = {
  // 백엔드(api.oeyo-cam.site)가 아니라 이 앱이 직접 제공하는 엔드포인트다.
  // 개발은 Vite 미들웨어, 웹은 Vercel 함수, 데스크탑은 Express 프록시가 받는다.
  interpret: () => `/ai-interpret`,
  youtubeSearch: () => `/youtube-search`,
  // 온보딩 대화(SSE 스트림). 다른 엔드포인트와 달리 JSON이 아니라
  // text/event-stream을 반환하므로 axios 대신 fetch로 직접 호출한다.
  onboardingChat: () => `/onboarding-chat`,
};

export const WindowEndpoints = {
  getWindows: () => `/windows`,
  createWindow: () => `/windows`,
  patchWindow: (id: number) => `/windows/${id}`,
  deleteWindow: (id: number) => `/windows/${id}`,
};

export const TodosEndPoints = {
  getTodos: (id: number, query?: TodoQueryParams) => {
    const q = query ? `?${stringifyQuery(query)}` : "";
    return `/windows/${id}/todos${q}`;
  },
  addTodo: (id: number) => `/windows/${id}/todos`,
  deleteTodo: (winId: number, todoId: number) =>
    `/windows/${winId}/todos/${todoId}`,
  doneTodo: (winId: number, todoId: number) =>
    `/windows/${winId}/todos/${todoId}`,
  updateTodoText: (winId: number, todoId: number) =>
    `/windows/${winId}/todos/${todoId}/text`,

  getAllTodos: (query?: TodoQueryParams) => {
    const q = query ? `?${stringifyQuery(query)}` : "";
    return `/todos${q}`;
  },
  updateTodoTextGlobal: (todoId: number) => `/todos/${todoId}`,
  toggleDoneGlobal: (todoId: number) => `/todos/${todoId}/done`,
  deleteTodoGlobal: (todoId: number) => `/todos/${todoId}`,
};

export const TimerEndPoints = {
  postTime: () => `/timer`,
  resetTime: (date: string) => `/timer/day/${date}`,
  getMonthTime: (year: number, month: number) =>
    `/timer?year=${year}&month=${month}`,
  getTodayTime: () => `/timer/today`,
  getTimerGoal: () => `/timer/goal`,
  postTimerGoal: () => `/timer/goal`,
  getTimerAnalytics: (year: number, month: number) =>
    `/timer/analytics?year=${year}&month=${month}`,
  patchPomoCycles: () => `/timer/today/cycles`,
};
