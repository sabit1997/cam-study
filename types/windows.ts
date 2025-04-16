export type WindowType = "none" | "camera" | "youtube" | "window";

export interface WindowData {
  id: number;
  user_id: string;
  type: WindowType;
  url?: string;
  z_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  created_at: string;
}
