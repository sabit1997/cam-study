import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  useMutation: vi.fn((options: unknown) => options),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: mocks.useMutation,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

import { TIMER_QUERY_KEY } from "./timer-services/query";
import { usePostTime, useResetTime } from "./timer-services/mutation";
import { TODO_QUERY_KEY } from "./todo-services/query";
import {
  useAddTodo,
  useDeleteTodo,
  useDeleteTodoGlobal,
  useDoneTodo,
  useToggleDoneGlobal,
  useUpdateTodo,
  useUpdateTodoGlobal,
} from "./todo-services/mutation";

type MutationOptions = { onSuccess?: () => void };

describe("mutation cache invalidation", () => {
  beforeEach(() => mocks.invalidateQueries.mockClear());

  it.each([usePostTime, () => useResetTime("2026-08-02")])(
    "invalidates every timer view",
    (useMutationHook) => {
      const options = useMutationHook() as unknown as MutationOptions;
      options.onSuccess?.();
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: TIMER_QUERY_KEY,
      });
    }
  );

  it.each([
    useAddTodo,
    useDoneTodo,
    useDeleteTodo,
    useUpdateTodo,
    useUpdateTodoGlobal,
    useToggleDoneGlobal,
    useDeleteTodoGlobal,
  ])("invalidates window and global todo views", (useMutationHook) => {
    const options = useMutationHook() as unknown as MutationOptions;
    options.onSuccess?.();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: TODO_QUERY_KEY,
    });
  });
});
