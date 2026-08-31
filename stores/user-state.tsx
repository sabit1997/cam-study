import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  getUserFromCookie,
  type StoredUser,
  USER_COOKIE_NAME,
} from "@/utils/auth-user";
import { IS_LOCAL_MODE } from "@/utils/app-mode";

const USER_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// 로컬 모드에서 로그인 UI를 건너뛰기 위한 고정 유저. userId를 문자열로 두어
// 서버 모드의 숫자 id와 충돌하지 않도록 한다.
const LOCAL_USER: StoredUser = { userId: "local", username: "나" };

interface UserState {
  user: StoredUser | null;
  isAuthenticated: boolean;

  login: (userData: StoredUser) => void;
  logout: () => void;
}

function saveUserCookie(user: StoredUser) {
  if (typeof document === "undefined") return;
  document.cookie = `${USER_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(user))}; Max-Age=${USER_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

function clearUserCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${USER_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
}

const storedUser = IS_LOCAL_MODE
  ? LOCAL_USER
  : typeof document === "undefined"
    ? null
    : getUserFromCookie(document.cookie);

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: storedUser,
      isAuthenticated: storedUser !== null,
      login: (userData) => {
        if (IS_LOCAL_MODE) return;
        saveUserCookie(userData);
        set({ user: userData, isAuthenticated: true });
      },
      logout: () => {
        if (IS_LOCAL_MODE) return;
        clearUserCookie();
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: "user-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
