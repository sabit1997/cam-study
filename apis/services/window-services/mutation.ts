import { useMutation, useQueryClient } from "@tanstack/react-query";
import WindowService from "./service";
import { WINDOW_QUERY_KEY } from "./query";
import { WindowPatchDto } from "@/types/dto";
import { useWindowStore } from "@/stores/window-state";

export const useCreateWindow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: WindowService.createWindow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WINDOW_QUERY_KEY });
    },
    meta: {
      SUCCESS_MESSAGE: "창이 생성되었습니다.",
      ERROR_SOURCE: "[창 생성 실패]",
    },
  });
};

export const usePatchWindow = () => {
  const queryClient = useQueryClient();
  const updateWindowType = useWindowStore((state) => state.updateWindowType);

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: WindowPatchDto }) =>
      WindowService.patchWindow(id, data),
    onMutate: async (newWindow) => {
      await queryClient.cancelQueries({ queryKey: WINDOW_QUERY_KEY });

      const previousWindow = queryClient.getQueryData([
        ...WINDOW_QUERY_KEY,
        newWindow.id,
      ]);

      queryClient.setQueryData([...WINDOW_QUERY_KEY, newWindow.id], newWindow);

      return { previousWindow, newWindow };
    },

    onSuccess: (newWindow) => {
      updateWindowType(newWindow.id, newWindow.type);
    },

    onError: (err, newWindow, context) => {
      queryClient.setQueryData(
        [...WINDOW_QUERY_KEY, context?.newWindow.id],
        context?.previousWindow
      );
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [...WINDOW_QUERY_KEY],
      });
    },
    meta: {
      SUCCESS_MESSAGE: "창이 수정되었습니다.",
      ERROR_SOURCE: "[창 수정 실패]",
    },
  });
};

export const useDeleteWindow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: WindowService.deleteWindow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WINDOW_QUERY_KEY });
    },
    meta: {
      SUCCESS_MESSAGE: "창이 삭제되었습니다.",
      ERROR_SOURCE: "[창 삭제 실패]",
    },
  });
};
