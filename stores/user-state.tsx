import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface User {
  userId: string | number;
  username: string;
}

interface UserState {
  user: User | null;
  isAuthenticated: boolean;

  login: (userData: User) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (userData: User) => set({ user: userData, isAuthenticated: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: "user-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
