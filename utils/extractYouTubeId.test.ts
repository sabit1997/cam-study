import { describe, it, expect } from "vitest";
import { extractYouTubeId } from "./extractYouTubeId";

describe("extractYouTubeId", () => {
  it("youtu.be 단축 URL에서 ID 추출", () => {
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("youtube.com watch URL에서 ID 추출", () => {
    expect(
      extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBe("dQw4w9WgXcQ");
  });

  it("youtube.com watch/ (trailing slash) URL에서 ID 추출", () => {
    expect(
      extractYouTubeId("https://www.youtube.com/watch/?v=dQw4w9WgXcQ")
    ).toBe("dQw4w9WgXcQ");
  });

  it("앞뒤 공백이 있는 URL도 처리", () => {
    expect(extractYouTubeId("  https://youtu.be/dQw4w9WgXcQ  ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("유효하지 않은 URL은 null 반환", () => {
    expect(extractYouTubeId("not-a-url")).toBeNull();
  });

  it("유튜브가 아닌 도메인은 null 반환", () => {
    expect(extractYouTubeId("https://vimeo.com/123456789")).toBeNull();
  });

  it("v 파라미터 없는 watch URL은 null 반환", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch")).toBeNull();
  });

  it("빈 문자열은 null 반환", () => {
    expect(extractYouTubeId("")).toBeNull();
  });

  it("youtube.com playlist URL은 null 반환", () => {
    expect(
      extractYouTubeId("https://www.youtube.com/playlist?list=PLxxx")
    ).toBeNull();
  });
});
