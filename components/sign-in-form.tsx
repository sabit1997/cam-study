"use client";

import { useRouter } from "next/navigation";
import InputWithLabel from "@/components/input-with-label";
import RectangleButton from "@/components/rectangle-button";
import { useState } from "react";
import { useLogin } from "@/apis/services/auth-services/mutation";
import { NextResponse } from "next/server";

const SignInForm = () => {
  const router = useRouter();
  const { mutate: signIn, isPending, error } = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    signIn(
      { email, password },
      {
        onSuccess: (res) => {
          const token = res.accessToken;
          document.cookie = `AccessToken=${res.accessToken}; path=/; max-age=${
            60 * 60 * 24 * 30
          }; secure; samesite=strict`;

          const response = NextResponse.json({ success: true });

          response.cookies.set({
            name: "AccessToken",
            value: token,
            httpOnly: true,
            path: "/",
            maxAge: 60 * 60 * 24 * 30,
            sameSite: "strict",
            secure: true,
          });

          router.push("/");
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
      <RectangleButton onClick={() => router.push("/sign-up")}>
        Go to Sign up Page
      </RectangleButton>
    </form>
  );
};

export default SignInForm;
