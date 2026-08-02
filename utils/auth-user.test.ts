import { describe, expect, it } from "vitest";
import { getUserFromCookie } from "./auth-user";

describe("stored user cookie", () => {
  it("restores a valid user regardless of other cookies", () => {
    const user = encodeURIComponent(JSON.stringify({ userId: 7, username: "oeyo" }));

    expect(getUserFromCookie(`theme=dark; cam-study-user=${user}`)).toEqual({
      userId: 7,
      username: "oeyo",
    });
  });

  it("rejects malformed or incomplete user data", () => {
    expect(getUserFromCookie("cam-study-user=not-json")).toBeNull();
    expect(getUserFromCookie("cam-study-user=%7B%7D")).toBeNull();
  });
});
