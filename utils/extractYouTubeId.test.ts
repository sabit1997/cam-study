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

  it("music.youtube.com watch URL에서 ID 추출", () => {
    expect(
      extractYouTubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBe("dQw4w9WgXcQ");
  });

  it("youtube.com으로 끝나는 사칭 도메인은 null 반환", () => {
    // endsWith("youtube.com")이면 통과했던 케이스
    expect(
      extractYouTubeId("https://evil-youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBeNull();
  });

  it("youtu.be 경로가 11자 id가 아니면 null 반환", () => {
    // 경로를 그대로 id로 쓰면 이런 값이 id 자리에 들어간다
    expect(extractYouTubeId("https://youtu.be/../../etc")).toBeNull();
    expect(extractYouTubeId("https://youtu.be/abc")).toBeNull();
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQextra")).toBeNull();
  });

  it("watch URL의 v 파라미터가 11자가 아니면 null 반환", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=short")).toBeNull();
  });
});
