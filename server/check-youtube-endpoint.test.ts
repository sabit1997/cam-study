import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../api/check-youtube";

/**
 * api/ 밖에 두는 이유: Vercel은 api/ 안의 모든 파일을 서버리스 함수로 배포한다.
 * 여기 있었을 때는 /api/check-youtube.test 엔드포인트가 만들어졌고, 그 파일은
 * vitest(devDependency)를 import하므로 배포본에서 로드에 실패한다.
 */
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
