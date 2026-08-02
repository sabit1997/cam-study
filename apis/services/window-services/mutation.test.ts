import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Window } from "@/types/windows";
import type { WindowPatchDto } from "@/types/dto";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(() => Promise.resolve()),
  cancelQueries: vi.fn(() => Promise.resolve()),
  setQueryData: vi.fn(),
  useMutation: vi.fn((options: unknown) => options),
  clearWindowPending: vi.fn(),
  updateWindowType: vi.fn(),
  state: {
    windows: [] as Window[],
    pendingWindowUpdates: {} as Record<number, number>,
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: mocks.useMutation,
  useQuery: vi.fn(),
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
    cancelQueries: mocks.cancelQueries,
    setQueryData: mocks.setQueryData,
  }),
}));

vi.mock("@/stores/window-state", () => {
  const useWindowStore = Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        ...mocks.state,
        clearWindowPending: mocks.clearWindowPending,
        updateWindowType: mocks.updateWindowType,
      }),
    {
      getState: () => ({
        ...mocks.state,
        clearWindowPending: mocks.clearWindowPending,
        updateWindowType: mocks.updateWindowType,
      }),
    }
  );
  return { useWindowStore };
});

import { usePatchWindow } from "./mutation";

type PatchVariables = {
  id: number;
  data: WindowPatchDto;
  generation?: number;
};

type MutationOptions = {
  onSuccess: (window: Window, variables: PatchVariables) => Promise<void>;
};

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

describe("window mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.windows = [];
    mocks.state.pendingWindowUpdates = {};
  });

  it("keeps the latest local bounds when an older z-index save completes", async () => {
    const localWindow = { ...serverWindow, x: 999, y: 888, zIndex: 7 };
    mocks.state.windows = [localWindow];
    mocks.state.pendingWindowUpdates = { 1: 2 };
    mocks.setQueryData.mockImplementation((_key, updater) =>
      updater([serverWindow])
    );

    const options = usePatchWindow() as unknown as MutationOptions;
    await options.onSuccess(
      { ...serverWindow, zIndex: 7 },
      { id: 1, data: { zIndex: 7 }, generation: 1 }
    );

    expect(mocks.setQueryData.mock.results[0].value).toEqual([localWindow]);
    expect(mocks.clearWindowPending).toHaveBeenCalledWith(1, 1);
  });

  it("cancels a stale windows query before completing the latest save", async () => {
    const localWindow = { ...serverWindow, x: 999 };
    mocks.state.windows = [localWindow];
    mocks.state.pendingWindowUpdates = { 1: 2 };
    mocks.setQueryData.mockImplementation((_key, updater) =>
      updater([serverWindow])
    );

    const options = usePatchWindow() as unknown as MutationOptions;
    await options.onSuccess(localWindow, {
      id: 1,
      data: { x: 999 },
      generation: 2,
    });

    expect(mocks.cancelQueries).toHaveBeenCalledWith({ queryKey: ["windows"] });
    expect(mocks.cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setQueryData.mock.invocationCallOrder[0]
    );
    expect(mocks.setQueryData.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clearWindowPending.mock.invocationCallOrder[0]
    );
  });
});
