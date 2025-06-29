export const extractYouTubeId = (url: string): string | null => {
  try {
    const u = new URL(url.trim());

    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1) || null;
    }

    if (
      u.hostname.endsWith("youtube.com") &&
      (u.pathname === "/watch" || u.pathname === "/watch/")
    ) {
      return u.searchParams.get("v");
    }

    return null;
  } catch {
    return null;
  }
};
