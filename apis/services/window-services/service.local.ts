import { getLocalKV } from "@/utils/local-store";
import { WindowPatchDto } from "@/types/dto";
import { Window } from "@/types/windows";

// 로컬 모드에서 창 CRUD는 LocalKV 위 배열 하나에 통째로 담는다.
// 서버 응답 계약(Window 형태, 숫자 id)를 유지해야 상위 mutation/query가 그대로 동작한다.

const KEY = "local:windows";
const LOCAL_USER_ID = "local";

// 세션 안에서 단조 증가하는 커서. Date.now()와 저장된 최댓값을 함께 봐서
// 재시작·초 단위 연속 생성 어느 쪽에서도 id 충돌이 나지 않는다.
let idCursor = 0;

async function readAll(): Promise<Window[]> {
  const data = await getLocalKV().get<Window[]>(KEY);
  return Array.isArray(data) ? data : [];
}

async function writeAll(windows: Window[]): Promise<void> {
  await getLocalKV().set(KEY, windows);
}

function nextId(existing: Window[]): number {
  const now = Date.now();
  const highest = existing.reduce((m, w) => Math.max(m, w.id), 0);
  idCursor = Math.max(idCursor + 1, now, highest + 1);
  return idCursor;
}

export default class WindowService {
  public static readonly createWindow = async (
    data: Omit<Window, "id" | "userId" | "createdAt">
  ): Promise<Window> => {
    const windows = await readAll();
    const created: Window = {
      ...data,
      id: nextId(windows),
      userId: LOCAL_USER_ID,
      createdAt: new Date().toISOString(),
    };
    await writeAll([...windows, created]);
    return created;
  };

  public static readonly patchWindow = async (
    id: number,
    data: WindowPatchDto
  ): Promise<Window> => {
    const windows = await readAll();
    const idx = windows.findIndex((w) => w.id === id);
    if (idx < 0) {
      throw new Error(`local window ${id} not found`);
    }
    const merged: Window = { ...windows[idx], ...data };
    const next = [...windows];
    next[idx] = merged;
    await writeAll(next);
    return merged;
  };

  public static readonly deleteWindow = async (id: number): Promise<void> => {
    const windows = await readAll();
    await writeAll(windows.filter((w) => w.id !== id));
  };

  public static readonly fetchWindows = async (): Promise<Window[]> => {
    return readAll();
  };
}
