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

export interface Window {
  id: number;
  type: "none" | "camera" | "youtube" | "window";
  url?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zindex: number;
  userId: string;
  createdAt: string;
}
