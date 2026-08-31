import { getLocalKV } from "@/utils/local-store";
import {
  AddTodoVars,
  DeleteTodoVars,
  DoneTodoVars,
  Todos,
  UpdateTodoVars,
  TodoQueryParams,
} from "@/types/todos";

// 로컬 모드 투두 저장. 창 id → Todos[] 맵을 통째로 담아 관리한다.
// 전역 조회는 값들을 flat 하고 window id 정보는 잃어도 무방하다(서버 응답 계약이 그러함).

const KEY = "local:todos";

type TodoMap = Record<string, Todos[]>;

let idCursor = 0;

async function readMap(): Promise<TodoMap> {
  const data = await getLocalKV().get<TodoMap>(KEY);
  return data && typeof data === "object" ? data : {};
}

async function writeMap(map: TodoMap): Promise<void> {
  await getLocalKV().set(KEY, map);
}

function nextId(map: TodoMap): number {
  const now = Date.now();
  let highest = 0;
  for (const list of Object.values(map)) {
    for (const t of list) if (t.id > highest) highest = t.id;
  }
  idCursor = Math.max(idCursor + 1, now, highest + 1);
  return idCursor;
}

function applyQuery(list: Todos[], q?: TodoQueryParams): Todos[] {
  let out = list;
  if (q?.done !== undefined) out = out.filter((t) => t.done === q.done);
  if (q?.date) out = out.filter((t) => t.createdAt.slice(0, 10) === q.date);
  if (q?.order) {
    const dir = q.order === "asc" ? 1 : -1;
    out = [...out].sort(
      (a, b) => dir * a.createdAt.localeCompare(b.createdAt)
    );
  }
  return out;
}

async function findLocation(
  todoId: number
): Promise<{ map: TodoMap; winKey: string; idx: number } | null> {
  const map = await readMap();
  for (const [winKey, list] of Object.entries(map)) {
    const idx = list.findIndex((t) => t.id === todoId);
    if (idx >= 0) return { map, winKey, idx };
  }
  return null;
}

export default class TodoService {
  public static readonly addTodo = async ({
    id,
    text,
  }: AddTodoVars): Promise<Todos> => {
    const map = await readMap();
    const winKey = String(id);
    const list = map[winKey] ?? [];
    const created: Todos = {
      id: nextId(map),
      text,
      done: false,
      createdAt: new Date().toISOString(),
    };
    map[winKey] = [...list, created];
    await writeMap(map);
    return created;
  };

  public static readonly doneTodo = async ({
    winId,
    todoId,
    done,
  }: DoneTodoVars): Promise<Todos> => {
    const map = await readMap();
    const winKey = String(winId);
    const list = map[winKey] ?? [];
    const idx = list.findIndex((t) => t.id === todoId);
    if (idx < 0) throw new Error(`local todo ${todoId} not found`);
    // 서버 규약과 동일: done은 현재 상태 → 반대로 토글한다.
    const updated: Todos = { ...list[idx], done: !done };
    const next = [...list];
    next[idx] = updated;
    map[winKey] = next;
    await writeMap(map);
    return updated;
  };

  public static readonly deleteTodo = async ({
    winId,
    todoId,
  }: DeleteTodoVars): Promise<void> => {
    const map = await readMap();
    const winKey = String(winId);
    if (!map[winKey]) return;
    map[winKey] = map[winKey].filter((t) => t.id !== todoId);
    await writeMap(map);
  };

  public static readonly updateTodo = async ({
    winId,
    todoId,
    text,
  }: UpdateTodoVars): Promise<Todos> => {
    const map = await readMap();
    const winKey = String(winId);
    const list = map[winKey] ?? [];
    const idx = list.findIndex((t) => t.id === todoId);
    if (idx < 0) throw new Error(`local todo ${todoId} not found`);
    const updated: Todos = { ...list[idx], text };
    const next = [...list];
    next[idx] = updated;
    map[winKey] = next;
    await writeMap(map);
    return updated;
  };

  public static readonly updateTodoGlobal = async (
    todoId: number,
    text: string
  ): Promise<{ todoId: number; text: string }> => {
    const loc = await findLocation(todoId);
    if (!loc) throw new Error(`local todo ${todoId} not found`);
    const list = loc.map[loc.winKey];
    const next = [...list];
    next[loc.idx] = { ...list[loc.idx], text };
    loc.map[loc.winKey] = next;
    await writeMap(loc.map);
    return { todoId, text };
  };

  public static readonly toggleDoneGlobal = async (
    todoId: number,
    done: boolean
  ): Promise<{ todoId: number; done: boolean }> => {
    const loc = await findLocation(todoId);
    if (!loc) throw new Error(`local todo ${todoId} not found`);
    const list = loc.map[loc.winKey];
    const next = [...list];
    // 서버 규약과 동일: 전역 API의 done은 최종 상태 → 그대로 저장.
    next[loc.idx] = { ...list[loc.idx], done };
    loc.map[loc.winKey] = next;
    await writeMap(loc.map);
    return { todoId, done };
  };

  public static readonly deleteTodoGlobal = async (
    todoId: number
  ): Promise<void> => {
    const loc = await findLocation(todoId);
    if (!loc) return;
    loc.map[loc.winKey] = loc.map[loc.winKey].filter((t) => t.id !== todoId);
    await writeMap(loc.map);
  };

  public static readonly fetchTodos = async (
    winId: number,
    query?: TodoQueryParams
  ): Promise<Todos[]> => {
    const map = await readMap();
    return applyQuery(map[String(winId)] ?? [], query);
  };

  public static readonly fetchAllTodos = async (
    query?: TodoQueryParams
  ): Promise<Todos[]> => {
    const map = await readMap();
    const flat = Object.values(map).flat();
    return applyQuery(flat, query);
  };
}
