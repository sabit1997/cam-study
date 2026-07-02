"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLogin } from "@/apis/services/auth-services/mutation";
import { useUserStore } from "@/stores/user-state";
import Link from "next/link";
import { FiMail, FiLock, FiEye, FiEyeOff } from "react-icons/fi";

const SignInForm = () => {
  const router = useRouter();
  const { mutate: signIn, isPending, isError, error } = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative flex flex-col items-center w-full">
      {/* Branding above card */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-12 flex items-center gap-2">
        <div
          style={{ background: "linear-gradient(135deg,#e8c8f0,#c0b8e8)" }}
          className="w-7 h-7 rounded-xl flex items-center justify-center"
        >
          <span className="text-white text-sm font-bold">C</span>
        </div>
        <span className="text-base font-semibold text-gray-700">CAM STUDY</span>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.95)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08), 0 16px 48px rgba(0,0,0,0.1)",
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800">다시 만나서 반가워요</h2>
          <p className="text-sm text-gray-400 mt-1">계정에 로그인하세요</p>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-3">
          {/* Email field */}
          <div className="relative">
            <FiMail
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-gray-700 outline-none transition-all"
              style={{
                background: "rgba(249,250,251,0.8)",
                border: "1px solid rgba(229,231,235,0.8)",
              }}
              autoComplete="email"
            />
          </div>

          {/* Password field */}
          <div className="relative">
            <FiLock
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm text-gray-700 outline-none transition-all"
              style={{
                background: "rgba(249,250,251,0.8)",
                border: "1px solid rgba(229,231,235,0.8)",
              }}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? <FiEyeOff size={15} /> : <FiEye size={15} />}
            </button>
          </div>

          {/* Error message */}
          {(isError && error instanceof Error) && (
            <div className="flex gap-2 items-center text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <span>{error.message}</span>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 rounded-xl text-white font-semibold text-sm mt-1 transition-opacity disabled:opacity-70 cursor-pointer"
            style={{ background: "linear-gradient(135deg, #a8c890, #6a9050)" }}
          >
            {isPending ? "로그인 중..." : "로그인"}
          </button>

          {/* Sign up link */}
          <p className="text-xs text-center text-gray-400">
            계정이 없으신가요?{" "}
            <Link href="/sign-up" className="text-lime-600 font-medium hover:underline">
              회원가입
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default SignInForm;
