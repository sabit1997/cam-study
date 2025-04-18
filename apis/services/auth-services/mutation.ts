import { useMutation } from "@tanstack/react-query";
import AuthService from "./service";

export const useLogin = () => {
  return useMutation({
    mutationFn: AuthService.login,
    meta: {
      SUCCESS_MESSAGE: "로그인 성공",
      ERROR_SOURCE: "[로그인 실패]",
    },
  });
};

export const useSignup = () => {
  return useMutation({
    mutationFn: AuthService.signup,
    meta: {
      SUCCESS_MESSAGE: "회원가입 완료",
      ERROR_SOURCE: "[회원가입 실패]",
    },
  });
};
