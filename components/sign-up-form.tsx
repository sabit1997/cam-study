"use client";

import { useSignup } from "@/apis/services/auth-services/mutation";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { FiUser, FiMail, FiLock, FiEye, FiEyeOff } from "react-icons/fi";

const SignUpForm = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
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
          <h2 className="text-xl font-semibold text-gray-800">시작해볼까요</h2>
          <p className="text-sm text-gray-400 mt-1">새 계정을 만들어보세요</p>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-3">
          {/* Name field */}
          <div className="relative">
            <FiUser
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              type="text"
              placeholder="이름 (최대 4자)"
              value={username}
              maxLength={4}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-gray-700 outline-none transition-all"
              style={{
                background: "rgba(249,250,251,0.8)",
                border: "1px solid rgba(229,231,235,0.8)",
              }}
              autoComplete="name"
            />
          </div>

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
              autoComplete="new-password"
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
          <p className="text-xs text-gray-400 -mt-1">
            8자 이상, 숫자, 특수문자 모두 포함
          </p>

          {/* Error message */}
          {error && (
            <div className="flex gap-2 items-center text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <span>{error}</span>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 rounded-xl text-white font-semibold text-sm mt-1 transition-opacity disabled:opacity-70 cursor-pointer"
            style={{ background: "linear-gradient(135deg, #a8c890, #6a9050)" }}
          >
            {isPending ? "회원가입 중..." : "회원가입"}
          </button>

          {/* Sign in link */}
          <p className="text-xs text-center text-gray-400">
            이미 계정이 있으신가요?{" "}
            <Link href="/sign-in" className="text-lime-600 font-medium hover:underline">
              로그인
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default SignUpForm;
