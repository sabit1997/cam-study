import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UserState {
  username: string | null;
  isAuthenticated: boolean;
  login: (username: string) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      username: null,
      isAuthenticated: false,
      login: (username: string) => set({ username, isAuthenticated: true }),
      logout: () => set({ username: null, isAuthenticated: false }),
    }),
    {
      name: "user-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
