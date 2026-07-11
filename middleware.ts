import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 비로그인 접근 허용 + 로그인 시 홈 리다이렉트
const AUTH_ONLY_PUBLIC = ["/sign-in", "/sign-up"];
// 로그인 여부 상관없이 항상 접근 허용
const OPEN_PATHS = ["/download"];

// Edge 런타임에서 서명 없이 exp 클레임만 확인.
// 서명 위조 차단은 백엔드 API 게이트웨이가 담당.
function isTokenValid(token: string): boolean {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    if (!payload.exp) return true;
    return Date.now() < payload.exp * 1000;
  } catch {
    return false;
  }
}

// AccessToken 만료 시 RefreshToken으로 자동 갱신 시도.
// Next.js rewrite를 거치지 않고 백엔드를 직접 호출해 self-referencing 없이 처리.
async function tryRefreshToken(cookieHeader: string): Promise<Headers | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl || !cookieHeader) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${apiUrl}/auth/refresh`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok ? res.headers : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// 백엔드 Set-Cookie 헤더를 브라우저 응답에 전달 (Edge 런타임 호환)
function forwardSetCookies(src: Headers, dest: NextResponse) {
  const cookies =
    typeof (src as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (src as { getSetCookie: () => string[] }).getSetCookie()
      : [src.get("set-cookie")].filter((c): c is string => c !== null);
  cookies.forEach((c) => dest.headers.append("Set-Cookie", c));
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("AccessToken")?.value;
  const pathname = request.nextUrl.pathname.replace(/\/$/, "");

  if (OPEN_PATHS.includes(pathname)) return NextResponse.next();

  const isPublic = AUTH_ONLY_PUBLIC.includes(pathname);
  const isValid = !!token && isTokenValid(token);

  // 토큰 유효 + 공개 페이지(로그인·회원가입) → 홈으로
  if (isValid && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 토큰 유효 → 통과
  if (isValid) return NextResponse.next();

  // 토큰 만료/없음 → RefreshToken으로 자동 로그인 시도
  const newHeaders = await tryRefreshToken(
    request.headers.get("cookie") ?? ""
  );

  if (newHeaders) {
    // 자동 로그인 성공: 공개 페이지면 홈으로, 보호 페이지면 원래 목적지로
    const response = isPublic
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
    forwardSetCookies(newHeaders, response);
    return response;
  }

  // 자동 로그인 실패: 공개 페이지면 통과, 보호 페이지면 로그인으로
  return isPublic
    ? NextResponse.next()
    : NextResponse.redirect(new URL("/sign-in", request.url));
}

export const config = {
  matcher: [
    "/((?!api|auth|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json).*)",
  ],
};
