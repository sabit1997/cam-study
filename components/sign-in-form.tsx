"use client";

import { useRouter } from "next/navigation";
import InputWithLabel from "@/components/input-with-label";
import RectangleButton from "@/components/rectangle-button";
import { useState } from "react";
import { useLogin } from "@/apis/services/auth-services/mutation";
import { useUserStore } from "@/stores/user-state";

const SignInForm = () => {
  const router = useRouter();
  const { mutate: signIn, isPending, isError, error } = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const loginUser = useUserStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (email && password) {
      signIn(
        { email, password },
        {
          onSuccess: (data) => {
            loginUser(data);
            router.replace("/");
            router.refresh();
          },
        }
      );
    } else {
      alert("아이디, 비밀번호를 입력해주세요.");
    }
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
      <RectangleButton type="submit" disabled={isPending && !isError}>
        {isPending ? "로그인 중 ..." : "로그인"}
      </RectangleButton>
      {error instanceof Error && (
        <p className="text-red-500 text-sm">{error.message}</p>
      )}
      <RectangleButton onClick={() => router.push("/sign-up")}>
        회원가입 페이지로 이동
      </RectangleButton>
    </form>
  );
};

export default SignInForm;
