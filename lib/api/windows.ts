import { supabase } from "@/utils/supabase";
import { WindowData } from "@/types/windows";
import { useSessionStore } from "@/stores/user";

export function getStoredUserId(): string | null {
  return useSessionStore.getState().getUserId();
}

export async function fetchWindows() {
  const userId = getStoredUserId();
  const { data, error } = await supabase
    .from("windows")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return data as WindowData[];
}

export async function createWindow(
  window: Omit<WindowData, "id" | "user_id" | "created_at">
) {
  const userId = getStoredUserId();
  const { data, error } = await supabase
    .from("windows")
    .insert([{ ...window, user_id: userId }])
    .select();

  if (error) throw error;
  return data?.[0];
}

export async function updateWindow(id: number, updates: Partial<WindowData>) {
  const { data, error } = await supabase
    .from("windows")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as WindowData;
}

export async function deleteWindow(id: number) {
  const { error } = await supabase.from("windows").delete().eq("id", id);
  if (error) throw error;
}
