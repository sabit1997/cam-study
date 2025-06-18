"use client";

import { useSignup } from "@/apis/services/auth-services/mutation";
import InputWithLabel from "@/components/input-with-label";
import RectangleButton from "@/components/rectangle-button";
import { useRouter } from "next/navigation";
import { useState } from "react";

const SignUpForm = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { mutate: signUp, isPending } = useSignup();

  const validatePassword = (pw: string): boolean => {
    const pattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
    return pattern.test(pw);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !username || !password) {
      setError("모든 필드를 입력해주세요.");
      return;
    }

    if (username.length > 4) {
      setError("사용자 이름은 4자 이하여야 합니다.");
      return;
    }

    if (!validatePassword(password)) {
      setError(
        "비밀번호는 8자 이상이며 문자, 숫자, 특수문자를 모두 포함해야 합니다."
      );
      return;
    }

    signUp(
      { email, password, username },
      {
        onSuccess: () => {
          router.replace("/sign-in");
        },
        onError: (err) => {
          if (err instanceof Error) {
            if (err.message.includes("이미 존재하는 이메일입니다.")) {
              setError("이미 존재하는 이메일입니다.");
            } else {
              setError("회원가입 중 오류가 발생했습니다. 다시 시도해주세요.");
            }
          } else {
            setError("알 수 없는 회원가입 오류가 발생했습니다.");
          }
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="text-red-500 text-center text-sm">{error}</p>}
      <InputWithLabel
        id="email"
        placeholder="Enter your email"
        label="EMAIL"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <InputWithLabel
        id="username"
        placeholder="Enter your name"
        maxLength={4}
        label="NAME"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <InputWithLabel
        id="password"
        placeholder="Enter your password"
        label="PASSWORD"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <span className="text-gray-500 text-xs">
        비밀번호: 8자 이상, 숫자, 특수문자 모두 포함.
      </span>
      <RectangleButton type="submit" disabled={isPending}>
        {isPending ? "회원가입 중..." : "회원가입"}
      </RectangleButton>
      <RectangleButton onClick={() => router.push("/sign-in")}>
        로그인 페이지로 이동
      </RectangleButton>
    </form>
  );
};

export default SignUpForm;
