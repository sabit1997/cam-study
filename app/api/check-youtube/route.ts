import { NextResponse } from "next/server";

// YouTube 영상 ID 형식: 영문자·숫자·하이픈·언더스코어 11자리
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export async function POST(request: Request) {
  const { videoId } = await request.json();

  if (!videoId || !YOUTUBE_ID_RE.test(videoId)) {
    return NextResponse.json(
      { error: "유효하지 않은 YouTube 영상 ID입니다." },
      { status: 400 }
    );
  }

  const API_KEY = process.env.YOUTUBE_API_KEY;
  if (!API_KEY) {
    return NextResponse.json(
      { error: "YouTube API 키가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  // snippet: 제목 가져오기 / status: 임베드 가능 여부 확인
  const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  apiUrl.searchParams.set("id", videoId);
  apiUrl.searchParams.set("key", API_KEY);
  apiUrl.searchParams.set("part", "status,snippet");

  try {
    const response = await fetch(apiUrl.toString());
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      return NextResponse.json({
        isEmbeddable: item.status.embeddable,
        title: item.snippet?.title ?? null,
      });
    }
    return NextResponse.json({ isEmbeddable: false, title: null });
  } catch (error) {
    console.error("YouTube API Error:", error);
    return NextResponse.json(
      { error: "영상 정보를 가져오는 데 실패했습니다." },
      { status: 500 }
    );
  }
}
