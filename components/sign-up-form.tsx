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
  const { mutate: signUp, isPending } = useSignup();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signUp(
      { email, password },
      {
        onSuccess: () => {
          router.push("/sign-in");
        },
        onError: () => {
          alert("회원가입 실패");
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
        {isPending ? "Signing up..." : "SIGN UP"}
      </RectangleButton>
      <RectangleButton onClick={() => router.push("/sign-in")}>
        Go to Sign in Page
      </RectangleButton>
    </form>
  );
};

export default SignUpForm;
