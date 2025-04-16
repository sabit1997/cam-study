import { supabase } from "@/utils/supabase";
import { WindowData } from "@/types/windows";

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;

  if (!userId) {
    throw new Error("로그인 세션이 만료되었습니다.");
  }

  return userId;
}

export async function fetchWindows(): Promise<WindowData[]> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("windows")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("fetchWindows 실패:", error);
    throw error;
  }

  return data as WindowData[];
}

export async function createWindow(
  window: Omit<WindowData, "id" | "user_id" | "created_at">
): Promise<WindowData> {
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("windows")
    .insert([{ ...window, user_id: userId }])
    .select()
    .single();

  if (error) {
    console.error("createWindow 실패:", error);
    throw error;
  }

  return data as WindowData;
}

export async function updateWindow(
  id: number,
  updates: Partial<WindowData>
): Promise<WindowData> {
  const { data, error } = await supabase
    .from("windows")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("updateWindow 실패:", error);
    throw error;
  }

  return data as WindowData;
}

export async function deleteWindow(id: number): Promise<void> {
  const { error } = await supabase.from("windows").delete().eq("id", id);

  if (error) {
    console.error("deleteWindow 실패:", error);
    throw error;
  }
}
