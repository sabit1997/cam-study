import { create } from "zustand";

type NoticeStore = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

export const useNoticeStore = create<NoticeStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
