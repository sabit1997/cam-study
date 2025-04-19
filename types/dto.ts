export type TypeList = "none" | "youtube" | "camera" | "window" | "todo";

export interface WindowPatchDto {
  type?: TypeList;
  url?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zindex?: number;
}
