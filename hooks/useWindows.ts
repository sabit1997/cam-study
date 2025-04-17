import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
} from "@tanstack/react-query";
import {
  fetchWindows,
  createWindow,
  updateWindow,
  deleteWindow,
} from "@/lib/api/windows";
import { WindowData } from "@/types/windows";

export function useWindows() {
  return useQuery<WindowData[], Error>({
    queryKey: ["windows"],
    queryFn: fetchWindows,
    staleTime: 1000 * 60,
    keepPreviousData: true,
  } as UseQueryOptions<WindowData[], Error>);
}

export function useCreateWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWindow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["windows"] });
    },
  });
}

export function useUpdateWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: number;
      updates: Partial<WindowData>;
    }) => updateWindow(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["windows"] });

      const previousWindows = queryClient.getQueryData<WindowData[]>([
        "windows",
      ]);

      queryClient.setQueryData<WindowData[]>(
        ["windows"],
        (old) =>
          old?.map((win) => (win.id === id ? { ...win, ...updates } : win)) ||
          []
      );

      return { previousWindows };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousWindows) {
        queryClient.setQueryData(["windows"], context.previousWindows);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["windows"] });
    },
  });
}

export function useDeleteWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWindow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["windows"] });
    },
  });
}
