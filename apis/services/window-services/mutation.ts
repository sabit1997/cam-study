import { useMutation, useQueryClient } from "@tanstack/react-query";
import WindowService from "./service";
import { WINDOW_QUERY_KEY } from "./query";
import { WindowPatchDto } from "@/types/dto";

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

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: WindowPatchDto }) =>
      WindowService.patchWindow(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WINDOW_QUERY_KEY });
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
