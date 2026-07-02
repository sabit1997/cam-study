import { TypeList } from "./dto";

export interface WindowData {
  id: number;
  user_id: string;
  type: TypeList;
  url?: string[];
  z_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  created_at: string;
}

export interface Window {
  id: number;
  type: TypeList;
  url?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  userId: string;
  createdAt: string;
}
