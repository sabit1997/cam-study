/**
 * YouTube URL에서 영상 id를 뽑는다. 뽑을 수 없으면 null.
 *
 * 사람이 입력창에 붙여넣는 URL(components/youtube-player.tsx)과 AI가 만든
 * PLAY_YOUTUBE의 url(utils/ai-action-validate.ts)이 **같은 문을 지난다.**
 * 그래서 여기가 느슨하면 AI 쪽만 느슨해지는 게 아니라 양쪽이 함께 느슨해진다.
 *
 * 두 가지를 엄격하게 본다.
 * - 호스트: endsWith("youtube.com")은 evil-youtube.com도 통과시킨다. 정확히 비교한다.
 * - id 형식: 11자 고정이다. 이게 없으면 youtu.be/../../x 같은 경로가 그대로 id가 된다.
 */

/** YouTube 영상 id는 11자 고정이다. api/check-youtube.ts와 같은 기준. */
export const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/** watch URL을 받아주는 호스트. 접미사 비교가 아니라 정확 비교용 목록이다. */
const WATCH_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

export const extractYouTubeId = (url: string): string | null => {
  try {
    const u = new URL(url.trim());

    const id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : WATCH_HOSTS.has(u.hostname) &&
            (u.pathname === "/watch" || u.pathname === "/watch/")
          ? u.searchParams.get("v")
          : null;

    return id && YOUTUBE_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
};
