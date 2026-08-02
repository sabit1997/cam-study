export interface StoredUser {
  userId: string | number;
  username: string;
}

export const USER_COOKIE_NAME = "cam-study-user";

export function getUserFromCookie(cookie: string): StoredUser | null {
  const value = cookie
    .split("; ")
    .find((item) => item.startsWith(`${USER_COOKIE_NAME}=`))
    ?.slice(USER_COOKIE_NAME.length + 1);
  if (!value) return null;

  try {
    const user = JSON.parse(decodeURIComponent(value));
    return typeof user?.username === "string" &&
      (typeof user.userId === "string" || typeof user.userId === "number")
      ? user
      : null;
  } catch {
    return null;
  }
}
