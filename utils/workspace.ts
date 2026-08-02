export const NAVIGATION_HEIGHT = 36;
export const REFERENCE_WIDTH = 1920;
export const REFERENCE_HEIGHT = 1080;

export function getPositionScale(viewportWidth: number, viewportHeight: number) {
  return Math.min(
    viewportWidth / REFERENCE_WIDTH,
    Math.max(0, viewportHeight - NAVIGATION_HEIGHT) /
      (REFERENCE_HEIGHT - NAVIGATION_HEIGHT)
  );
}

export function clampWindowPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number
) {
  return {
    x: Math.max(0, Math.min(x, Math.max(0, viewportWidth - width))),
    y: Math.max(
      0,
      Math.min(y, Math.max(0, viewportHeight - NAVIGATION_HEIGHT - height))
    ),
  };
}
