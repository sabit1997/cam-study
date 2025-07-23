const NOTICE_KEY = "hideNoticeVersion";

export const getHiddenNoticeVersion = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(NOTICE_KEY);
  } catch {
    return null;
  }
};

export const hideCurrentNotice = (version: string) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTICE_KEY, version);
  } catch {}
};
