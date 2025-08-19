import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { videoId } = await request.json();

  if (!videoId) {
    return NextResponse.json(
      { error: "Video ID is required" },
      { status: 400 }
    );
  }

  const API_KEY = process.env.YOUTUBE_API_KEY;
  const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${API_KEY}&part=status`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const isEmbeddable = data.items[0].status.embeddable;
      return NextResponse.json({ isEmbeddable });
    } else {
      return NextResponse.json({ isEmbeddable: false });
    }
  } catch (error) {
    console.error("YouTube API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch video status" },
      { status: 500 }
    );
  }
}
