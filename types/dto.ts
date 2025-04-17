export interface WindowPatchDto {
  type?: "none" | "camera" | "youtube" | "window";
  url?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
}
