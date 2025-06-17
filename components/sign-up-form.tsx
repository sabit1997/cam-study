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
        onError: () => {
          alert("회원가입 실패");
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
        8자 이상, 숫자, 특수문자 모두 포함.
      </span>
      <RectangleButton type="submit" disabled={isPending}>
        {isPending ? "Signing up..." : "SIGN UP"}
      </RectangleButton>
      <RectangleButton onClick={() => router.push("/sign-in")}>
        Go to Sign in Page
      </RectangleButton>
    </form>
  );
};

export default SignUpForm;
