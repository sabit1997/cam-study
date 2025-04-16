"use client";

import { supabase } from "@/utils/supabase";
import { useRouter } from "next/navigation";
import { useSignIn } from "@/hooks/useAuthMutations";
import InputWithLabel from "@/components/input-with-label";
import RectangleButton from "@/components/rectangle-button";
import { useState } from "react";
import { getCurrentUser } from "@/lib/api/auth";
import { useSessionStore } from "@/stores/user";

const SignInForm = () => {
  const router = useRouter();
  const { mutate: signIn, isPending, error } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    signIn(
      { email, password },
      {
        onSuccess: async (data) => {
          try {
            if (data?.session) {
              await supabase.auth.setSession(data.session); // ✅ 세션 저장
            }

            const user = await getCurrentUser();
            const userId = user?.id;
            if (userId) {
              useSessionStore.getState().setUserId(userId);
              console.log("✅ 로그인 성공, userId:", userId);
            }
            router.push("/");
          } catch (e) {
            console.error("유저 정보 가져오기 실패:", e);
          }
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <InputWithLabel
        id="email"
        placeholder="Enter your email"
        label="EMAIL"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <InputWithLabel
        id="password"
        placeholder="Enter your password"
        label="PASSWORD"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <RectangleButton type="submit" disabled={isPending}>
        {isPending ? "Signing in..." : "SIGN IN"}
      </RectangleButton>
      {error instanceof Error && (
        <p className="text-red-500 text-sm">{error.message}</p>
      )}
    </form>
  );
};

export default SignInForm;
