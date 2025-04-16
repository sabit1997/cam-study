import { useMutation } from "@tanstack/react-query";
import { signInWithEmail, signUpWithEmail } from "@/lib/api/auth";

export const useSignIn = () => {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signInWithEmail(email, password),
  });
};

export const useSignUp = () => {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signUpWithEmail(email, password),
  });
};
