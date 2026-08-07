import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "./check-youtube";

describe("check-youtube", () => {
  it("uses Vercel's parsed JSON body to validate a video", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        items: [{ status: { embeddable: true }, snippet: { title: "Test video" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");

    const json = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json } as unknown as VercelResponse;
    const req = { method: "POST", body: { videoId: "dQw4w9WgXcQ" } } as VercelRequest;

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(json).toHaveBeenCalledWith({ isEmbeddable: true, title: "Test video" });
  });
});
