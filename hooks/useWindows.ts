import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchWindows,
  createWindow,
  updateWindow,
  deleteWindow,
} from "@/lib/api/windows";
import { WindowData } from "@/types/windows";

export function useWindows() {
  return useQuery<WindowData[]>({
    queryKey: ["windows"],
    queryFn: fetchWindows,
  });
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
    onSuccess: () => {
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
