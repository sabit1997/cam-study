import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  getUserFromCookie,
  type StoredUser,
  USER_COOKIE_NAME,
} from "@/utils/auth-user";

const USER_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

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

const storedUser =
  typeof document === "undefined" ? null : getUserFromCookie(document.cookie);

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: storedUser,
      isAuthenticated: storedUser !== null,
      login: (userData) => {
        saveUserCookie(userData);
        set({ user: userData, isAuthenticated: true });
      },
      logout: () => {
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
