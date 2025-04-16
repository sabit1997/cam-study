"use client";

import { useRouter } from "next/navigation";
import { useSignUp } from "@/hooks/useAuthMutations";
import InputWithLabel from "@/components/input-with-label";
import RectangleButton from "@/components/rectangle-button";
import { useState } from "react";

const SignUpForm = () => {
  const router = useRouter();
  const { mutate: signUp, isPending, error } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signUp(
      { email, password },
      {
        onSuccess: () => {
          alert("회원가입 성공!");
          router.push("/sign-in");
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
      {error instanceof Error && (
        <p className="text-red-500 text-sm">{error.message}</p>
      )}
    </form>
  );
};

export default SignUpForm;
