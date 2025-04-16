import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { encrypt, decrypt } from "@/utils/encryption";

interface SessionState {
  encryptedUserId: string | null;
  setUserId: (id: string) => void;
  getUserId: () => string | null;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      encryptedUserId: null,
      setUserId: (id) => set({ encryptedUserId: encrypt(id) }),
      getUserId: () => {
        const encrypted = get().encryptedUserId;
        return encrypted ? decrypt(encrypted) : null;
      },
    }),
    {
      name: "dfx",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
