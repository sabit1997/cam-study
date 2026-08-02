export const NAVIGATION_HEIGHT = 36;
export const WORKSPACE_WIDTH = 1920;
export const WORKSPACE_HEIGHT = 1080 - NAVIGATION_HEIGHT;

export function getWorkspaceScale(viewportWidth: number, viewportHeight: number) {
  return Math.min(
    viewportWidth / WORKSPACE_WIDTH,
    Math.max(0, viewportHeight - NAVIGATION_HEIGHT) / WORKSPACE_HEIGHT
  );
}

export function clampWindowPosition(
  x: number,
  y: number,
  width: number,
  height: number
) {
  return {
    x: Math.max(0, Math.min(x, Math.max(0, WORKSPACE_WIDTH - width))),
    y: Math.max(0, Math.min(y, Math.max(0, WORKSPACE_HEIGHT - height))),
  };
}
