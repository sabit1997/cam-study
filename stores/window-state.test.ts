import { beforeEach, describe, expect, it } from "vitest";
import { useWindowStore } from "./window-state";
import type { Window } from "@/types/windows";

const serverWindow: Window = {
  id: 1,
  type: "todo",
  x: 10,
  y: 20,
  width: 300,
  height: 240,
  zIndex: 1,
  userId: "user",
  createdAt: "2026-08-02T00:00:00Z",
};

describe("window store", () => {
  beforeEach(() => useWindowStore.getState().setWindows([]));

  it("accepts the server state for an existing window", () => {
    useWindowStore.getState().setWindows([
      { ...serverWindow, x: 999, width: 999, zIndex: 7 },
    ]);

    useWindowStore.getState().mergeWindows([serverWindow]);

    expect(useWindowStore.getState().windows[0]).toEqual(serverWindow);
  });

  it("moves only the focused window above the current highest z-index", () => {
    useWindowStore.getState().setWindows([
      serverWindow,
      { ...serverWindow, id: 2, zIndex: 8 },
      { ...serverWindow, id: 3, zIndex: 12 },
    ]);

    useWindowStore.getState().bringToFront(1);

    expect(useWindowStore.getState().windows.map(({ id, zIndex }) => ({ id, zIndex }))).toEqual([
      { id: 1, zIndex: 13 },
      { id: 2, zIndex: 8 },
      { id: 3, zIndex: 12 },
    ]);
  });
});
