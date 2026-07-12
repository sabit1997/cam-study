"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLogin } from "@/apis/services/auth-services/mutation";
import { useUserStore } from "@/stores/user-state";
import Link from "next/link";
import { FiMail, FiLock, FiEye, FiEyeOff } from "react-icons/fi";
import { useThemeStore } from "@/stores/theme-state";

// request.ts가 plain object { message, code, response }로 reject하므로
// instanceof Error 대신 응답 형태를 직접 확인한다.
function getLoginErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 400 || status === 401 || status === 404) {
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    }
    if (status && status >= 500) {
      return "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    }
  }
  return "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
}

const SignInForm = () => {
  const router = useRouter();
  const { mutate: signIn, isPending, isError, error, reset: resetMutation } = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const loginUser = useUserStore((state) => state.login);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  const clearErrors = () => {
    setValidationError(null);
    if (isError) resetMutation();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!email || !password) {
      setValidationError("이메일과 비밀번호를 입력해주세요.");
      return;
    }

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
  };

  const displayError =
    validationError ?? (isError ? getLoginErrorMessage(error) : null);

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
        <span className="text-base font-semibold text-gray-700 dark:text-gray-300">CAM STUDY</span>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: isDarkMode ? "rgba(22,24,34,0.92)" : "rgba(255,255,255,0.88)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.95)",
          boxShadow: isDarkMode
            ? "0 4px 16px rgba(0,0,0,0.4), 0 16px 48px rgba(0,0,0,0.5)"
            : "0 4px 16px rgba(0,0,0,0.08), 0 16px 48px rgba(0,0,0,0.1)",
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-gray-100 dark:border-gray-700/50">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">다시 만나서 반가워요</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">계정에 로그인하세요</p>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-3">
          {/* Email field */}
          <div className="relative">
            <FiMail
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              size={16}
            />
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearErrors(); }}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-gray-700 dark:text-gray-200 outline-none transition-all"
              style={{
                background: isDarkMode ? "rgba(15,17,25,0.6)" : "rgba(249,250,251,0.8)",
                border: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(229,231,235,0.8)",
              }}
              autoComplete="email"
            />
          </div>

          {/* Password field */}
          <div className="relative">
            <FiLock
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              size={16}
            />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="비밀번호"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearErrors(); }}
              className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm text-gray-700 dark:text-gray-200 outline-none transition-all"
              style={{
                background: isDarkMode ? "rgba(15,17,25,0.6)" : "rgba(249,250,251,0.8)",
                border: isDarkMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(229,231,235,0.8)",
              }}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              tabIndex={-1}
            >
              {showPassword ? <FiEyeOff size={15} /> : <FiEye size={15} />}
            </button>
          </div>

          {/* Error message */}
          {displayError && (
            <div className="flex gap-2 items-center text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-800/40 rounded-xl px-3 py-2.5">
              <span>{displayError}</span>
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
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
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
