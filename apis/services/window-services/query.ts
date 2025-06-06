import { useQuery } from "@tanstack/react-query";
import { fetchWindows } from "./service";

export const WINDOW_QUERY_KEY = ["windows"];

export const useWindows = () => {
  return useQuery({
    queryKey: WINDOW_QUERY_KEY,
    queryFn: fetchWindows,
    meta: {
      ERROR_SOURCE: "[창 목록 불러오기 실패]",
      SUCCESS_MESSAGE: "창 데이터를 불러왔습니다.",
    },
  });
};
